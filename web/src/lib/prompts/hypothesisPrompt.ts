/**
 * Reserved-id helpers for hypothesis-driven nudges — mirrors onDemandPrompt.ts. A `hypothesis-*`
 * prompt_slot is treated as high-novelty and, at fire time, is never generated on the spot (the
 * async loop pre-generates it; see getDailyPrompt). See HYPOTHESIS_NUDGE_ENGINE.md §7.4.
 */
export const HYPOTHESIS_PROMPT_PREFIX = "hypothesis-";
export const HYPOTHESIS_PROMPT_LABEL = "Hypothesis prompt";

export function isHypothesisPromptId(id?: string | null): id is string {
  return Boolean(id?.startsWith(HYPOTHESIS_PROMPT_PREFIX));
}

export function newHypothesisPromptId(): string {
  const token = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
  return `${HYPOTHESIS_PROMPT_PREFIX}${token}`;
}
