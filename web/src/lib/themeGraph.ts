import {
  analyzedTopicsForEntry,
  prepareCorpusForAnalysis,
  salientPhrasesAcrossEntries,
  type EntryForAnalysis,
} from "@/lib/themeAnalysis";
import {
  applyThemeLayout,
  runForceDirectedLayout,
} from "@/lib/themeGraphLayout";
import { TOPICS, isValidTopicId, type TopicId } from "@/lib/promptEngine";

export type ThemeGraphNode = {
  id: string;
  label: string;
  shortLabel: string;
  kind: "topic" | "moment" | "signal" | "entity";
  weight: number;
  x: number;
  y: number;
  color: string;
};

export type ThemeGraphEdge = {
  source: string;
  target: string;
  weight: number;
  kind: "cooccur" | "flow" | "moment" | "phrase" | "entity";
};

/** A snippet of entry text associated with a topic or phrase. */
export type GraphExcerpt = {
  entryId: string;
  momentLabel: string;
  text: string;
};

/** How a topic is trending compared to the prior period. */
export type TopicTrend = "new" | "growing" | "steady" | "fading";

/** Rich context the graph can surface when a node or edge is tapped. */
export type GraphContext = {
  /** Entry excerpts per node id (topics and phrases). */
  excerpts: Record<string, GraphExcerpt[]>;
  /** Trend per topic id (only topics). */
  trends: Record<string, TopicTrend>;
  /** For each topic, the strongest co-occurring topic id + shared count. */
  strongestBond: Record<string, { peerId: string; peerLabel: string; count: number }>;
  /** Human-readable explanation per edge key ("source|target"). */
  edgeExplanations: Record<string, string>;
};

export type DayThemeGraph = {
  nodes: ThemeGraphNode[];
  edges: ThemeGraphEdge[];
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  context?: GraphContext;
};

/**
 * Compute a topic-weight map from entries (for use as `priorTopicWeights`).
 * Counts how many entries each topic appears in.
 */
export function topicWeightsFromEntries(
  entries: { topics_snapshot: string[]; body: string }[],
  profileTopics: string[] = []
): Record<string, number> {
  const profile = profileTopics.filter((t): t is TopicId => isValidTopicId(t));
  const corpus: EntryForAnalysis[] = entries.map((e, i) => ({
    id: `prior-${i}`,
    topics_snapshot: e.topics_snapshot,
    body: e.body ?? "",
  }));
  const { tokenSets, df, nDocs } = prepareCorpusForAnalysis(corpus);
  const weights: Record<string, number> = {};
  for (let i = 0; i < corpus.length; i++) {
    const topics = analyzedTopicsForEntry(corpus[i]!, profile, tokenSets, df, nDocs);
    for (const t of topics) {
      weights[t] = (weights[t] ?? 0) + 1;
    }
  }
  return weights;
}

const GRAPH_WIDTH = 720;
const GRAPH_HEIGHT = 540;

/** Inkwell-aligned palette per writing theme. */
export const TOPIC_COLORS: Record<TopicId, string> = {
  processing: "#8b6f52",
  gratitude: "#a89462",
  free: "#9a7b5c",
  relationships: "#c49272",
  work: "#5f7388",
  self_compassion: "#b39a7d",
  memories: "#7a6588",
  hopes: "#6d8a72",
  travel: "#a07d5c",
};

const MOMENT_COLOR = "#6b6560";
const SIGNAL_COLOR = "#5c5348";
const ENTITY_COLOR = "#4f5f6d";

type DayEntryInput = {
  id: string;
  topics_snapshot: string[];
  prompt_slot: string;
  nudgeLabel: string;
  written_at: string;
  body: string;
  dayKey?: string;
  dayLabel?: string;
};

export type ThemeGraphOptions = {
  momentByDay?: boolean;
  /** Deterministic seed for force layout. */
  layoutSeed?: number;
  /** Topic weights from the prior period — used to compute trend (new/growing/steady/fading). */
  priorTopicWeights?: Record<string, number>;
  /** Include lightweight entity nodes (people/places) from text. */
  includeEntities?: boolean;
  /** Max entity nodes to keep (top by weight). */
  maxEntities?: number;
  /**
   * Stable positions from a global layout registry (timeline Life map).
   * Skips per-period force layout when set.
   */
  fixedPositions?: Record<string, { x: number; y: number }>;
};

const ENTITY_STOP = new Set(
  [
    "I",
    "A",
    "An",
    "The",
    "And",
    "But",
    "Or",
    "So",
    "To",
    "Of",
    "In",
    "On",
    "At",
    "For",
    "With",
    "From",
    "As",
    "It",
    "This",
    "That",
    "Today",
    "Yesterday",
    "Tomorrow",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ].map((s) => s.toLowerCase())
);

function slugifyEntity(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Lightweight entity extractor (rule-based).
 * Pulls capitalized word sequences like "New York" or "Sam" from the body.
 */
function extractEntitiesFromText(body: string): string[] {
  const clean = body.replace(/\s+/g, " ").trim();
  if (!clean) return [];

  const hits = new Set<string>();
  const re =
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g; // 1–3 word titlecase
  for (const m of clean.matchAll(re)) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    const lower = raw.toLowerCase();
    if (ENTITY_STOP.has(lower)) continue;
    if (raw.length < 3) continue;
    hits.add(raw);
  }
  return [...hits].slice(0, 12);
}

function topicLabel(id: TopicId): string {
  return TOPICS[id]?.label ?? id;
}

function shortLabel(text: string, max = 20): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 8 ? cut.slice(0, sp) : cut).trim()}…`;
}

function addEdge(
  edges: Map<string, { weight: number; kind: ThemeGraphEdge["kind"] }>,
  a: string,
  b: string,
  kind: ThemeGraphEdge["kind"],
  amount = 1
) {
  if (a === b) return;
  const key = [a, b].sort().join("|");
  const prev = edges.get(key);
  if (prev) {
    edges.set(key, { weight: prev.weight + amount, kind: prev.kind });
  } else {
    edges.set(key, { weight: amount, kind });
  }
}

export function buildDayThemeGraph(
  entries: DayEntryInput[],
  profileTopics: string[] = [],
  options: ThemeGraphOptions = {}
): DayThemeGraph {
  const profile = profileTopics.filter((t): t is TopicId => isValidTopicId(t));
  const corpusEntries: EntryForAnalysis[] = entries.map((e) => ({
    id: e.id,
    topics_snapshot: e.topics_snapshot,
    body: e.body ?? "",
  }));
  const { tokenSets, df, nDocs } = prepareCorpusForAnalysis(corpusEntries);

  const topicWeight = new Map<string, number>();
  const momentWeight = new Map<string, number>();
  const entityWeight = new Map<string, number>();
  const edgeMap = new Map<
    string,
    { weight: number; kind: ThemeGraphEdge["kind"] }
  >();

  const chronology: TopicId[][] = [];
  const entryEntities: string[][] = [];
  const entryToMoment = new Map<string, string>();

  for (let idx = 0; idx < entries.length; idx++) {
    const entry = entries[idx]!;
    const topics = analyzedTopicsForEntry(
      corpusEntries[idx]!,
      profile,
      tokenSets,
      df,
      nDocs
    );
    chronology.push(topics);

    const momentId = options.momentByDay
      ? `day:${entry.dayKey ?? entry.written_at.slice(0, 10)}`
      : `moment:${entry.prompt_slot}`;
    entryToMoment.set(entry.id, momentId);
    momentWeight.set(momentId, (momentWeight.get(momentId) ?? 0) + 1);

    const entities =
      options.includeEntities ? extractEntitiesFromText(entry.body) : [];
    entryEntities.push(entities);

    for (const t of topics) {
      topicWeight.set(t, (topicWeight.get(t) ?? 0) + 1);
      addEdge(edgeMap, t, momentId, "moment", 1);
    }

    if (entities.length > 0) {
      for (const eLabel of entities) {
        const eId = `entity:${slugifyEntity(eLabel)}`;
        entityWeight.set(eId, (entityWeight.get(eId) ?? 0) + 1);
        addEdge(edgeMap, eId, momentId, "entity", 1);
        for (const t of topics) addEdge(edgeMap, eId, t, "entity", 1);
      }
    }

    for (let i = 0; i < topics.length; i++) {
      for (let j = i + 1; j < topics.length; j++) {
        addEdge(edgeMap, topics[i]!, topics[j]!, "cooccur", 2);
      }
    }
  }

  for (let i = 1; i < chronology.length; i++) {
    const prev = chronology[i - 1]!;
    const next = chronology[i]!;
    for (const a of prev) {
      for (const b of next) {
        if (a !== b) addEdge(edgeMap, a, b, "flow", 1);
      }
    }
  }

  const phrases = salientPhrasesAcrossEntries(corpusEntries);
  const phraseNodes: ThemeGraphNode[] = [];

  for (const ph of phrases) {
    for (const entryId of ph.entryIds) {
      const momentId = entryToMoment.get(entryId);
      if (momentId) {
        addEdge(edgeMap, ph.id, momentId, "phrase", 1);
      }
    }
    phraseNodes.push({
      id: ph.id,
      label: ph.label,
      shortLabel: shortLabel(ph.label, 22),
      kind: "signal",
      weight: ph.entryIds.size,
      x: 0,
      y: 0,
      color: SIGNAL_COLOR,
    });
  }

  const topicIds = [...topicWeight.keys()];
  const momentIds = [...momentWeight.keys()];
  const entityIds = [...entityWeight.keys()];

  const cx = GRAPH_WIDTH / 2;
  const cy = GRAPH_HEIGHT / 2;

  if (
    topicIds.length === 0 &&
    momentIds.length === 0 &&
    phraseNodes.length === 0
  ) {
    return {
      nodes: [],
      edges: [],
      width: GRAPH_WIDTH,
      height: GRAPH_HEIGHT,
      centerX: cx,
      centerY: cy,
    };
  }

  const topicNodes: ThemeGraphNode[] = topicIds.map((id) => {
    const tid = id as TopicId;
    return {
      id,
      label: topicLabel(tid),
      shortLabel: shortLabel(topicLabel(tid), 22),
      kind: "topic" as const,
      weight: topicWeight.get(id) ?? 1,
      x: 0,
      y: 0,
      color: TOPIC_COLORS[tid] ?? TOPIC_COLORS.free,
    };
  });

  const momentNodesList: ThemeGraphNode[] = momentIds.map((id) => {
    const label = options.momentByDay
      ? id.replace("day:", "")
      : (() => {
          const slot = id.replace("moment:", "");
          return (
            entries.find((e) => e.prompt_slot === slot)?.nudgeLabel ?? slot
          );
        })();
    return {
      id,
      label,
      shortLabel: shortLabel(label, 14),
      kind: "moment" as const,
      weight: momentWeight.get(id) ?? 1,
      x: 0,
      y: 0,
      color: MOMENT_COLOR,
    };
  });

  const entityNodes: ThemeGraphNode[] = (() => {
    if (!options.includeEntities) return [];
    const limit = Math.max(0, options.maxEntities ?? 18);
    const sorted = entityIds
      .map((id) => ({ id, w: entityWeight.get(id) ?? 1 }))
      .sort((a, b) => b.w - a.w)
      .slice(0, limit);
    return sorted.map(({ id, w }) => {
      const label = id.replace(/^entity:/, "").replace(/-/g, " ");
      const pretty = label.replace(/\b\w/g, (c) => c.toUpperCase());
      return {
        id,
        label: pretty,
        shortLabel: shortLabel(pretty, 16),
        kind: "entity" as const,
        weight: w,
        x: 0,
        y: 0,
        color: ENTITY_COLOR,
      };
    });
  })();

  let nodes: ThemeGraphNode[] = [
    ...topicNodes,
    ...momentNodesList,
    ...phraseNodes,
    ...entityNodes,
  ];

  const edges: ThemeGraphEdge[] = [...edgeMap.entries()].map(
    ([key, { weight, kind }]) => {
      const [source, target] = key.split("|");
      return { source, target, weight, kind };
    }
  );

  // If we limited entity nodes, drop edges that point to filtered entities.
  if (entityNodes.length > 0 && options.includeEntities) {
    const keep = new Set(nodes.map((n) => n.id));
    const filtered = edges.filter((e) => keep.has(e.source) && keep.has(e.target));
    edges.length = 0;
    edges.push(...filtered);
  }

  const edgeInputs = edges.map((e) => ({
    source: e.source,
    target: e.target,
    weight: e.weight,
  }));

  if (options.fixedPositions && Object.keys(options.fixedPositions).length > 0) {
    nodes = applyThemeLayout(
      nodes,
      edges,
      options.fixedPositions,
      GRAPH_WIDTH,
      GRAPH_HEIGHT
    );
  } else {
    const layoutSeed =
      options.layoutSeed ??
      entries.map((e) => e.id).join("").length +
        topicIds.length * 17 +
        momentIds.length * 31;

    nodes = runForceDirectedLayout(
      nodes,
      edgeInputs,
      GRAPH_WIDTH,
      GRAPH_HEIGHT,
      layoutSeed
    );
  }

  const context = buildGraphContext(
    entries,
    corpusEntries,
    chronology,
    entryEntities,
    entryToMoment,
    edgeMap,
    nodes,
    options
  );

  return {
    nodes,
    edges,
    width: GRAPH_WIDTH,
    height: GRAPH_HEIGHT,
    centerX: cx,
    centerY: cy,
    context,
  };
}

// ---------------------------------------------------------------------------
// Context builder — excerpts, bonds, edge explanations
// ---------------------------------------------------------------------------

function extractExcerpt(body: string, maxLen = 120): string {
  const clean = body.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  const cut = clean.slice(0, maxLen);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 40 ? cut.slice(0, sp) : cut).trim()}…`;
}

function buildGraphContext(
  entries: DayEntryInput[],
  corpus: EntryForAnalysis[],
  chronology: TopicId[][],
  entryEntities: string[][],
  entryToMoment: Map<string, string>,
  edgeMap: Map<string, { weight: number; kind: ThemeGraphEdge["kind"] }>,
  nodes: ThemeGraphNode[],
  options: ThemeGraphOptions
): GraphContext {
  const excerpts: Record<string, GraphExcerpt[]> = {};
  const topicCooccur = new Map<string, Map<string, number>>();

  for (let idx = 0; idx < entries.length; idx++) {
    const entry = entries[idx]!;
    const topics = chronology[idx]!;
    const entities = entryEntities[idx] ?? [];
    const momentId = entryToMoment.get(entry.id) ?? "";
    const momentNode = nodes.find((n) => n.id === momentId);
    const momentLabel = momentNode?.label ?? entry.nudgeLabel;
    const snippet = extractExcerpt(entry.body);
    if (!snippet) continue;

    for (const tid of topics) {
      if (!excerpts[tid]) excerpts[tid] = [];
      if (excerpts[tid].length < 3) {
        excerpts[tid].push({ entryId: entry.id, momentLabel, text: snippet });
      }
    }

    if (options.includeEntities && entities.length > 0) {
      for (const eLabel of entities) {
        const eid = `entity:${slugifyEntity(eLabel)}`;
        if (!excerpts[eid]) excerpts[eid] = [];
        if (excerpts[eid].length < 3) {
          excerpts[eid].push({ entryId: entry.id, momentLabel, text: snippet });
        }
      }
    }

    for (let i = 0; i < topics.length; i++) {
      for (let j = i + 1; j < topics.length; j++) {
        const a = topics[i]!;
        const b = topics[j]!;
        if (!topicCooccur.has(a)) topicCooccur.set(a, new Map());
        if (!topicCooccur.has(b)) topicCooccur.set(b, new Map());
        topicCooccur.get(a)!.set(b, (topicCooccur.get(a)!.get(b) ?? 0) + 1);
        topicCooccur.get(b)!.set(a, (topicCooccur.get(b)!.get(a) ?? 0) + 1);
      }
    }
  }

  // Phrase excerpts — find entries containing the bigram
  for (const node of nodes) {
    if (node.kind !== "signal") continue;
    const words = node.label.split(" ");
    if (words.length < 2) continue;
    const a = words[0]!.toLowerCase();
    const b = words[1]!.toLowerCase();
    excerpts[node.id] = [];
    for (const entry of entries) {
      const lower = entry.body.toLowerCase();
      if (lower.includes(`${a} ${b}`) || lower.includes(`${a}  ${b}`)) {
        const momentId = entryToMoment.get(entry.id) ?? "";
        const momentNode = nodes.find((n) => n.id === momentId);
        excerpts[node.id].push({
          entryId: entry.id,
          momentLabel: momentNode?.label ?? entry.nudgeLabel,
          text: extractExcerpt(entry.body),
        });
        if (excerpts[node.id].length >= 3) break;
      }
    }
  }

  const strongestBond: GraphContext["strongestBond"] = {};
  for (const [tid, peers] of topicCooccur) {
    let best: { peerId: string; count: number } | null = null;
    for (const [pid, cnt] of peers) {
      if (!best || cnt > best.count) best = { peerId: pid, count: cnt };
    }
    if (best) {
      const peerNode = nodes.find((n) => n.id === best!.peerId);
      strongestBond[tid] = {
        peerId: best.peerId,
        peerLabel: peerNode?.label ?? best.peerId,
        count: best.count,
      };
    }
  }

  const edgeExplanations: Record<string, string> = {};
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  for (const [key, { weight, kind }] of edgeMap) {
    const [srcId, tgtId] = key.split("|");
    const src = nodeById.get(srcId!);
    const tgt = nodeById.get(tgtId!);
    if (!src || !tgt) continue;

    let text: string;
    switch (kind) {
      case "cooccur":
        text = `${src.label} and ${tgt.label} appeared in the same ${weight === 1 ? "entry" : `${Math.ceil(weight / 2)} entries`}`;
        break;
      case "flow":
        text = `${src.label} flowed into ${tgt.label} across consecutive entries`;
        break;
      case "moment":
        text = src.kind === "topic"
          ? `${src.label} came up during ${tgt.label}`
          : `${tgt.label} came up during ${src.label}`;
        break;
      case "phrase":
        text = `The phrase "${src.kind === "signal" ? src.label : tgt.label}" appeared in entries linked to ${src.kind === "signal" ? tgt.label : src.label}`;
        break;
      default:
        text = `${src.label} connects to ${tgt.label} (${weight}×)`;
    }
    edgeExplanations[key] = text;
  }

  const trends: Record<string, TopicTrend> = {};
  if (options.priorTopicWeights) {
    const prior = options.priorTopicWeights;
    for (const node of nodes) {
      if (node.kind !== "topic") continue;
      const current = node.weight;
      const prev = prior[node.id] ?? 0;
      if (prev === 0) {
        trends[node.id] = "new";
      } else if (current > prev * 1.25) {
        trends[node.id] = "growing";
      } else if (current < prev * 0.6) {
        trends[node.id] = "fading";
      } else {
        trends[node.id] = "steady";
      }
    }
  }

  return { excerpts, trends, strongestBond, edgeExplanations };
}
