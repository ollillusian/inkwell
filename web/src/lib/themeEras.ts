import type { ThemeTimelineStep } from "@/lib/themeTimeline";

export type TimelineEra = {
  eraIndex: number;
  startStepIndex: number;
  label: string;
};

function topicIds(step: ThemeTimelineStep): Set<string> {
  return new Set(
    step.graph.nodes.filter((n) => n.kind === "topic").map((n) => n.id)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const id of a) {
    if (b.has(id)) inter++;
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Auto chapter boundaries when the theme mix shifts sharply. */
export function detectTimelineEras(steps: ThemeTimelineStep[]): TimelineEra[] {
  if (steps.length === 0) return [];

  const eras: TimelineEra[] = [];
  let start = 0;
  let eraIndex = 0;

  const titleForStart = (step: ThemeTimelineStep, idx: number): string => {
    const c = step.change;
    if (c?.newTopics[0]) return c.newTopics[0];
    if (c?.strongerTopics[0]) return `${c.strongerTopics[0]} builds`;
    if (idx === 0) return "Opening";
    return `Chapter ${eraIndex + 1}`;
  };

  eras.push({
    eraIndex: 0,
    startStepIndex: 0,
    label: titleForStart(steps[0]!, 0),
  });

  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1]!;
    const curr = steps[i]!;
    const sim = jaccard(topicIds(prev), topicIds(curr));
    const shift =
      sim < 0.38 ||
      (curr.change?.newTopics.length ?? 0) >= 2 ||
      (curr.beat === "surge" && (curr.change?.newTopics.length ?? 0) >= 1);

    if (shift) {
      eraIndex++;
      start = i;
      eras.push({
        eraIndex,
        startStepIndex: i,
        label: titleForStart(curr, i),
      });
    }
  }

  return eras;
}

export function eraLabelAtStep(
  eras: TimelineEra[],
  stepIndex: number
): string | null {
  if (eras.length === 0) return null;
  let current = eras[0]!;
  for (const era of eras) {
    if (era.startStepIndex <= stepIndex) current = era;
    else break;
  }
  return current.startStepIndex === stepIndex ? current.label : null;
}
