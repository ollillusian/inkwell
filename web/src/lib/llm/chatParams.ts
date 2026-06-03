import type OpenAI from "openai";

/**
 * GPT-5 family and the o-series reasoning models use a different Chat Completions contract than
 * gpt-4o / gpt-4.1:
 *   - they require `max_completion_tokens`, not `max_tokens`;
 *   - they reject custom sampling — `temperature` must stay at the default (1), and
 *     `top_p` / `frequency_penalty` / `presence_penalty` are unsupported;
 *   - they spend hidden "reasoning" tokens out of the completion budget.
 *
 * `tuningParams()` returns the model-family-correct token + sampling fields to spread into a
 * `chat.completions.create` / `.parse` call, so the generators keep a single code path and stay
 * backward compatible with gpt-4o-style models.
 */

type ChatParams = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;

/** gpt-5*, o1/o3/o4… — the reasoning families with the new request contract. */
export function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o[1-9])/i.test(model);
}

/** Extra completion budget so any reasoning tokens don't truncate the visible output.
 *  With `reasoning_effort: "none"` there are normally zero reasoning tokens, so this is just a
 *  harmless safety margin (you are billed only for tokens actually used). */
const REASONING_HEADROOM = 2048;

export type GenerationTuning = {
  /** Desired visible output tokens (omit to let the model decide). */
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
};

export function tuningParams(
  model: string,
  t: GenerationTuning
): Partial<ChatParams> {
  if (isReasoningModel(model)) {
    // Sampling params are rejected. "none" disables reasoning, so these calls behave like a fast
    // non-reasoning model (reasoning_tokens ~ 0) — right for short prompts/prose where we don't
    // need chain-of-thought. Raise to "low"/"medium" if you want quality over latency on hard tasks.
    return {
      max_completion_tokens: (t.maxTokens ?? 1024) + REASONING_HEADROOM,
      reasoning_effort: "none",
    };
  }
  const params: Partial<ChatParams> = {};
  if (t.maxTokens !== undefined) params.max_tokens = t.maxTokens;
  if (t.temperature !== undefined) params.temperature = t.temperature;
  if (t.topP !== undefined) params.top_p = t.topP;
  if (t.frequencyPenalty !== undefined) params.frequency_penalty = t.frequencyPenalty;
  if (t.presencePenalty !== undefined) params.presence_penalty = t.presencePenalty;
  return params;
}
