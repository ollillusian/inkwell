import type { ThemeTimelineStep } from "@/lib/themeTimeline";
import type {
  DirectorsCutInput,
  TimelineFrameInsightInput,
} from "@/lib/llm/generateTimelineInsight";

function changeSummary(step: ThemeTimelineStep): string {
  const c = step.change;
  if (!c || c.firstDay) return "opening frame";
  const parts: string[] = [];
  if (c.newTopics.length) parts.push(`new: ${c.newTopics.join(", ")}`);
  if (c.topicsAgain.length) parts.push(`continued: ${c.topicsAgain.slice(0, 3).join(", ")}`);
  if (c.strongerTopics.length) parts.push(`grew: ${c.strongerTopics.join(", ")}`);
  if (c.newPhrases.length) parts.push(`phrases: ${c.newPhrases[0]}`);
  return parts.length ? parts.join("; ") : "subtle link shifts";
}

function collectExcerpts(step: ThemeTimelineStep, max = 3): string[] {
  const ctx = step.graph.context?.excerpts;
  if (!ctx) return [];
  const out: string[] = [];
  for (const list of Object.values(ctx)) {
    for (const ex of list) {
      if (ex.text && out.length < max) out.push(ex.text);
    }
  }
  return out;
}

export function frameInsightInputFromStep(
  step: ThemeTimelineStep
): TimelineFrameInsightInput {
  return {
    granularity: step.granularity,
    periodLabel: step.dateLabel,
    ruleCaption: step.caption,
    entryCount: step.entryCount,
    stats: {
      topics: step.stats.topics,
      links: step.stats.links,
      phrases: step.stats.phrases,
    },
    changeSummary: changeSummary(step),
    excerpts: collectExcerpts(step),
  };
}

export function directorsCutInputFromSteps(
  steps: ThemeTimelineStep[],
  eraTitles: string[]
): DirectorsCutInput | null {
  if (steps.length === 0) return null;
  const first = steps[0]!;
  const last = steps[steps.length - 1]!;
  return {
    granularity: last.granularity,
    rangeLabel: `${first.shortLabel} – ${last.shortLabel}`,
    frameSummaries: steps.map(
      (s) => `${s.shortLabel}: ${s.caption} (${s.entryCount} entries, ${s.stats.topics} themes)`
    ),
    eraTitles,
  };
}
