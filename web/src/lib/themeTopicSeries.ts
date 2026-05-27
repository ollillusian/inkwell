import type { ThemeTimelineStep } from "@/lib/themeTimeline";

export type TopicSeriesPoint = {
  stepIndex: number;
  dateKey: string;
  shortLabel: string;
  weight: number;
};

/** Topic presence/weight across timeline steps (for sparkline / focus rail). */
export function topicSeriesAcrossSteps(
  steps: ThemeTimelineStep[],
  topicId: string
): TopicSeriesPoint[] {
  return steps.map((s, stepIndex) => {
    const node = s.graph.nodes.find((n) => n.id === topicId && n.kind === "topic");
    return {
      stepIndex,
      dateKey: s.dateKey,
      shortLabel: s.shortLabel,
      weight: node?.weight ?? 0,
    };
  });
}

export function firstLastStepWithTopic(
  series: TopicSeriesPoint[]
): { first?: TopicSeriesPoint; last?: TopicSeriesPoint } {
  const hits = series.filter((p) => p.weight > 0);
  return { first: hits[0], last: hits[hits.length - 1] };
}
