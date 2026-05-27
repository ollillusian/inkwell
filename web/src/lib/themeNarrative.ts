import type { ThemeTimelineStep } from "@/lib/themeTimeline";

export type ThemeTimelineBeat = "open" | "quiet" | "shift" | "surge";

function listSnippet(items: string[], max = 2): string {
  if (items.length === 0) return "";
  const head = items.slice(0, max).join(", ");
  const rest = items.length - max;
  return rest > 0 ? `${head}, +${rest} more` : head;
}

const GRAIN_OPEN: Record<ThemeTimelineStep["granularity"], string> = {
  day: "The map starts here",
  week: "This week opens the story",
  month: "This month sets the stage",
};

const GRAIN_QUIET: Record<ThemeTimelineStep["granularity"], string> = {
  day: "A quieter beat — connections shifted more than themes",
  week: "A steadier week — the map shifted at the edges",
  month: "A calmer month — familiar themes held the center",
};

/** Rule-based narrator line (Story cinema). */
export function buildStepCaption(step: ThemeTimelineStep): string {
  const c = step.change;
  const g = step.granularity;

  if (!c) return "Your theme map for this period.";

  if (c.firstDay) {
    return `${GRAIN_OPEN[g]}: ${step.stats.topics} themes, ${step.stats.links} links, ${step.entryCount} ${step.entryCount === 1 ? "entry" : "entries"}.`;
  }

  const bits: string[] = [];

  if (c.newTopics.length > 0) {
    bits.push(
      g === "day"
        ? `picked up ${listSnippet(c.newTopics)}`
        : `new on the map: ${listSnippet(c.newTopics)}`
    );
  }

  if (c.topicsAgain.length > 0 && bits.length < 2) {
    bits.push(
      g === "day"
        ? `kept ${listSnippet(c.topicsAgain)}`
        : `still weaving ${listSnippet(c.topicsAgain)}`
    );
  }

  if (c.newPhrases.length > 0) {
    bits.push(`phrase "${c.newPhrases[0]}" emerged`);
  }

  if (c.strongerTopics.length > 0 && bits.length < 2) {
    bits.push(`${c.strongerTopics[0]} grew louder`);
  }

  if (c.newMoments.length > 0 && bits.length < 2) {
    bits.push(`new moment: ${c.newMoments[0]}`);
  }

  if (bits.length === 0) return GRAIN_QUIET[g];

  return bits.join(" · ");
}

export function buildStepBeat(step: ThemeTimelineStep): ThemeTimelineBeat {
  const c = step.change;
  if (!c || c.firstDay) return "open";
  const surgeScore =
    c.newTopics.length + c.strongerTopics.length + c.newPhrases.length;
  if (surgeScore >= 3 || c.newTopics.length >= 2) return "surge";
  if (
    c.newTopics.length > 0 ||
    c.newPhrases.length > 0 ||
    c.strongerTopics.length > 0 ||
    c.newMoments.length > 0
  ) {
    return "shift";
  }
  return "quiet";
}
