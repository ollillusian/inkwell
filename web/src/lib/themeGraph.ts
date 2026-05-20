import {
  analyzedTopicsForEntry,
  prepareCorpusForAnalysis,
  salientPhrasesAcrossEntries,
  type EntryForAnalysis,
} from "@/lib/themeAnalysis";
import { runForceDirectedLayout } from "@/lib/themeGraphLayout";
import { TOPICS, isValidTopicId, type TopicId } from "@/lib/promptEngine";

export type ThemeGraphNode = {
  id: string;
  label: string;
  shortLabel: string;
  kind: "topic" | "moment" | "signal";
  weight: number;
  x: number;
  y: number;
  color: string;
};

export type ThemeGraphEdge = {
  source: string;
  target: string;
  weight: number;
  kind: "cooccur" | "flow" | "moment" | "phrase";
};

export type DayThemeGraph = {
  nodes: ThemeGraphNode[];
  edges: ThemeGraphEdge[];
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

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
};

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
  const edgeMap = new Map<
    string,
    { weight: number; kind: ThemeGraphEdge["kind"] }
  >();

  const chronology: TopicId[][] = [];
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

    for (const t of topics) {
      topicWeight.set(t, (topicWeight.get(t) ?? 0) + 1);
      addEdge(edgeMap, t, momentId, "moment", 1);
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

  let nodes: ThemeGraphNode[] = [
    ...topicNodes,
    ...momentNodesList,
    ...phraseNodes,
  ];

  const edges: ThemeGraphEdge[] = [...edgeMap.entries()].map(
    ([key, { weight, kind }]) => {
      const [source, target] = key.split("|");
      return { source, target, weight, kind };
    }
  );

  const layoutSeed =
    options.layoutSeed ??
    entries.map((e) => e.id).join("").length +
      topicIds.length * 17 +
      momentIds.length * 31;

  nodes = runForceDirectedLayout(
    nodes,
    edges.map((e) => ({
      source: e.source,
      target: e.target,
      weight: e.weight,
    })),
    GRAPH_WIDTH,
    GRAPH_HEIGHT,
    layoutSeed
  );

  return {
    nodes,
    edges,
    width: GRAPH_WIDTH,
    height: GRAPH_HEIGHT,
    centerX: cx,
    centerY: cy,
  };
}
