import { TOPICS, isValidTopicId, type TopicId } from "@/lib/promptEngine";

export type ThemeGraphNode = {
  id: string;
  label: string;
  kind: "topic" | "moment";
  weight: number;
  x: number;
  y: number;
};

export type ThemeGraphEdge = {
  source: string;
  target: string;
  weight: number;
};

export type DayThemeGraph = {
  nodes: ThemeGraphNode[];
  edges: ThemeGraphEdge[];
};

type DayEntryInput = {
  id: string;
  topics_snapshot: string[];
  prompt_slot: string;
  nudgeLabel: string;
};

function topicLabel(id: TopicId): string {
  return TOPICS[id]?.label ?? id;
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
  edges: Map<string, number>,
  a: string,
  b: string,
  amount = 1
) {
  if (a === b) return;
  const key = [a, b].sort().join("|");
  edges.set(key, (edges.get(key) ?? 0) + amount);
}

function layoutRing(
  ids: string[],
  cx: number,
  cy: number,
  radius: number
): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  ids.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / ids.length - Math.PI / 2;
    pos.set(id, {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  });
  return pos;
}

export function buildDayThemeGraph(
  entries: DayEntryInput[],
  profileTopics: string[] = []
): DayThemeGraph {
  const profile = profileTopics.filter((t): t is TopicId => isValidTopicId(t));
  const topicWeight = new Map<string, number>();
  const momentWeight = new Map<string, number>();
  const edgeWeights = new Map<string, number>();

  const chronology: TopicId[][] = [];

  for (const entry of entries) {
    const topics = topicsForEntry(entry, profile);
    chronology.push(topics);

    const momentId = `moment:${entry.prompt_slot}`;
    momentWeight.set(momentId, (momentWeight.get(momentId) ?? 0) + 1);

    for (const t of topics) {
      topicWeight.set(t, (topicWeight.get(t) ?? 0) + 1);
      addEdge(edgeWeights, t, momentId, 1);
    }

    for (let i = 0; i < topics.length; i++) {
      for (let j = i + 1; j < topics.length; j++) {
        addEdge(edgeWeights, topics[i], topics[j], 2);
      }
    }
  }

  for (let i = 1; i < chronology.length; i++) {
    const prev = chronology[i - 1];
    const next = chronology[i];
    for (const a of prev) {
      for (const b of next) {
        addEdge(edgeWeights, a, b, 1);
      }
    }
  }

  const topicIds = [...topicWeight.keys()];
  const momentIds = [...momentWeight.keys()];

  if (topicIds.length === 0 && momentIds.length === 0) {
    return { nodes: [], edges: [] };
  }

  const width = 360;
  const height = 280;
  const cx = width / 2;
  const cy = height / 2;
  const topicPos = layoutRing(topicIds, cx, cy, 108);
  const momentPos = layoutRing(momentIds, cx, cy, 52);

  const nodes: ThemeGraphNode[] = [
    ...topicIds.map((id) => {
      const p = topicPos.get(id)!;
      return {
        id,
        label: topicLabel(id as TopicId),
        kind: "topic" as const,
        weight: topicWeight.get(id) ?? 1,
        x: p.x,
        y: p.y,
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
        kind: "moment" as const,
        weight: momentWeight.get(id) ?? 1,
        x: p.x,
        y: p.y,
      };
    }),
  ];

  const edges: ThemeGraphEdge[] = [...edgeWeights.entries()].map(
    ([key, weight]) => {
      const [source, target] = key.split("|");
      return { source, target, weight };
    }
  );

  return { nodes, edges };
}
