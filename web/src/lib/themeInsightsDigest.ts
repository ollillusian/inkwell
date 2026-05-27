import { TOPICS, isValidTopicId, type TopicId } from "@/lib/promptEngine";
import type { ThemeTimelineStep } from "@/lib/themeTimeline";

export type ThemeWritingDigest = {
  /** One line for Today / journal list widgets. */
  headline: string;
  quietTopicLabels: string[];
  activeTopicLabels: string[];
  surgingTopicLabels: string[];
  framesWithEntries: number;
};

function topicLabelsInSteps(
  steps: ThemeTimelineStep[],
  fromIndex: number
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of steps.slice(fromIndex)) {
    for (const n of s.graph.nodes) {
      if (n.kind !== "topic") continue;
      counts.set(n.id, (counts.get(n.id) ?? 0) + n.weight);
    }
  }
  return counts;
}

/**
 * Rule-based digest for widgets (no LLM). Uses profile topics vs recent timeline steps.
 */
export function buildThemeWritingDigest(
  steps: ThemeTimelineStep[],
  profileTopics: TopicId[],
  recentFrameCount = 7
): ThemeWritingDigest | null {
  if (steps.length === 0) return null;

  const window = steps.slice(-recentFrameCount);
  const counts = topicLabelsInSteps(steps, steps.length - window.length);
  const active = [...counts.entries()]
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1]);

  const activeTopicLabels = active
    .slice(0, 4)
    .map(([id]) =>
      isValidTopicId(id) ? TOPICS[id].label : id
    );

  const profileSet = new Set(
    profileTopics.filter((t): t is TopicId => isValidTopicId(t))
  );
  const quietTopicLabels = [...profileSet]
    .filter((id) => !counts.has(id) || (counts.get(id) ?? 0) === 0)
    .map((id) => TOPICS[id].label)
    .slice(0, 4);

  const surgingTopicLabels: string[] = [];
  const last = window[window.length - 1];
  if (last?.change?.strongerTopics.length) {
    surgingTopicLabels.push(...last.change.strongerTopics.slice(0, 2));
  }
  if (last?.change?.newTopics.length) {
    surgingTopicLabels.push(...last.change.newTopics.slice(0, 2));
  }

  let headline: string;
  if (quietTopicLabels.length > 0 && activeTopicLabels.length > 0) {
    headline = `${quietTopicLabels[0]} has been quiet lately; ${activeTopicLabels[0]} is carrying your map.`;
  } else if (surgingTopicLabels.length > 0) {
    headline = `${surgingTopicLabels[0]} is moving to the front of your writing.`;
  } else if (activeTopicLabels.length > 0) {
    headline = `Your map is centered on ${activeTopicLabels.slice(0, 2).join(" and ")}.`;
  } else {
    headline = "Keep writing to grow your theme map.";
  }

  return {
    headline,
    quietTopicLabels,
    activeTopicLabels,
    surgingTopicLabels: [...new Set(surgingTopicLabels)],
    framesWithEntries: window.filter((s) => s.entryCount > 0).length,
  };
}
