import { TOPICS, isValidTopicId, type TopicId } from "@/lib/promptEngine";

export type ThemeGraphNode = {
  id: string;
  label: string;
  shortLabel: string;
  kind: "topic" | "moment";
  weight: number;
  x: number;
  y: number;
  color: string;
};

export type ThemeGraphEdge = {
  source: string;
  target: string;
  weight: number;
  kind: "cooccur" | "flow" | "moment";
};

export type DayThemeGraph = {
  nodes: ThemeGraphNode[];
  edges: ThemeGraphEdge[];
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

const GRAPH_WIDTH = 400;
const GRAPH_HEIGHT = 340;

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

const MOMENT_COLOR = "#8a9bab";
const MOMENT_GLOW = "#c5d0da";

type DayEntryInput = {
  id: string;
  topics_snapshot: string[];
  prompt_slot: string;
  nudgeLabel: string;
};

function topicLabel(id: TopicId): string {
  return TOPICS[id]?.label ?? id;
}

function shortLabel(text: string, max = 18): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 8 ? cut.slice(0, sp) : cut).trim()}…`;
}

function topicsForEntry(
  entry: DayEntryInput,
  profileTopics: TopicId[]
): TopicId[] {
  const fromSnapshot = entry.topics_snapshot.filter((t): t is TopicId =>
    isValidTopicId(t)
  );
  if (fromSnapshot.length > 0) return fromSnapshot;
  if (profileTopics.length > 0) return profileTopics.slice(0, 2);
  return ["free"];
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

function layoutRing(
  ids: string[],
  cx: number,
  cy: number,
  radius: number,
  offset = 0
): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  const n = ids.length;
  ids.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2 + offset;
    pos.set(id, {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  });
  return pos;
}

/** Gentle repulsion so labels and nodes breathe. */
function relaxPositions(
  nodes: ThemeGraphNode[],
  cx: number,
  cy: number,
  iterations = 12
): ThemeGraphNode[] {
  const pos = nodes.map((n) => ({ ...n }));
  const minDist = (a: ThemeGraphNode, b: ThemeGraphNode) =>
    a.kind === "topic" || b.kind === "topic" ? 56 : 44;

  for (let k = 0; k < iterations; k++) {
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const dx = pos[j].x - pos[i].x;
        const dy = pos[j].y - pos[i].y;
        const dist = Math.hypot(dx, dy) || 1;
        const need = minDist(pos[i], pos[j]);
        if (dist < need) {
          const push = ((need - dist) / dist) * 0.35;
          pos[i].x -= dx * push;
          pos[i].y -= dy * push;
          pos[j].x += dx * push;
          pos[j].y += dy * push;
        }
      }
    }
    for (const n of pos) {
      const dx = n.x - cx;
      const dy = n.y - cy;
      const targetR = n.kind === "topic" ? 118 : 62;
      const dist = Math.hypot(dx, dy) || 1;
      const pull = (dist - targetR) * 0.08;
      n.x -= (dx / dist) * pull;
      n.y -= (dy / dist) * pull;
    }
  }
  return pos;
}

export function buildDayThemeGraph(
  entries: DayEntryInput[],
  profileTopics: string[] = []
): DayThemeGraph {
  const profile = profileTopics.filter((t): t is TopicId => isValidTopicId(t));
  const topicWeight = new Map<string, number>();
  const momentWeight = new Map<string, number>();
  const edgeMap = new Map<
    string,
    { weight: number; kind: ThemeGraphEdge["kind"] }
  >();

  const chronology: TopicId[][] = [];

  for (const entry of entries) {
    const topics = topicsForEntry(entry, profile);
    chronology.push(topics);

    const momentId = `moment:${entry.prompt_slot}`;
    momentWeight.set(momentId, (momentWeight.get(momentId) ?? 0) + 1);

    for (const t of topics) {
      topicWeight.set(t, (topicWeight.get(t) ?? 0) + 1);
      addEdge(edgeMap, t, momentId, "moment", 1);
    }

    for (let i = 0; i < topics.length; i++) {
      for (let j = i + 1; j < topics.length; j++) {
        addEdge(edgeMap, topics[i], topics[j], "cooccur", 2);
      }
    }
  }

  for (let i = 1; i < chronology.length; i++) {
    const prev = chronology[i - 1];
    const next = chronology[i];
    for (const a of prev) {
      for (const b of next) {
        if (a !== b) addEdge(edgeMap, a, b, "flow", 1);
      }
    }
  }

  const topicIds = [...topicWeight.keys()];
  const momentIds = [...momentWeight.keys()];

  const cx = GRAPH_WIDTH / 2;
  const cy = GRAPH_HEIGHT / 2;

  if (topicIds.length === 0 && momentIds.length === 0) {
    return {
      nodes: [],
      edges: [],
      width: GRAPH_WIDTH,
      height: GRAPH_HEIGHT,
      centerX: cx,
      centerY: cy,
    };
  }

  const topicPos = layoutRing(topicIds, cx, cy, 112, 0.12);
  const momentPos = layoutRing(
    momentIds,
    cx,
    cy,
    momentIds.length === 1 ? 0 : 58,
    -0.2
  );

  let nodes: ThemeGraphNode[] = [
    ...topicIds.map((id) => {
      const p = topicPos.get(id)!;
      const tid = id as TopicId;
      const label = topicLabel(tid);
      return {
        id,
        label,
        shortLabel: shortLabel(label, 20),
        kind: "topic" as const,
        weight: topicWeight.get(id) ?? 1,
        x: p.x,
        y: p.y,
        color: TOPIC_COLORS[tid] ?? TOPIC_COLORS.free,
      };
    }),
    ...momentIds.map((id) => {
      const p = momentPos.get(id)!;
      const slot = id.replace("moment:", "");
      const label =
        entries.find((e) => e.prompt_slot === slot)?.nudgeLabel ?? slot;
      return {
        id,
        label,
        shortLabel: shortLabel(label, 14),
        kind: "moment" as const,
        weight: momentWeight.get(id) ?? 1,
        x: p.x,
        y: p.y,
        color: MOMENT_COLOR,
      };
    }),
  ];

  if (momentIds.length === 1) {
    const only = nodes.find((n) => n.kind === "moment");
    if (only) {
      only.x = cx;
      only.y = cy;
    }
  }

  nodes = relaxPositions(nodes, cx, cy);

  const edges: ThemeGraphEdge[] = [...edgeMap.entries()].map(
    ([key, { weight, kind }]) => {
      const [source, target] = key.split("|");
      return { source, target, weight, kind };
    }
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
