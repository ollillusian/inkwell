/**
 * Shared OpenAI client for the hypothesis engine — the codebase's first JSON-schema-validated,
 * version-pinned, retried/timed-out model call. The three legacy generators
 * (generatePrompt / generateTimelineInsight / generatePeriodStory) each construct their own
 * `new OpenAI({ apiKey })` with no retry/timeout/validation; this module is where the reliable
 * path lives. See HYPOTHESIS_NUDGE_ENGINE.md §3.
 *
 * Quarantine principle: the LLM is used for one-shot, stateless judgments only. It never holds
 * confidence state — that lives in the database + update loop. So failures return a typed error
 * (or null), never a silently wrong value the caller can't distinguish.
 */
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { ZodType } from "zod";
import { tuningParams } from "@/lib/llm/chatParams";

/** Pinned, dated snapshots — replaces the unpinned `process.env.OPENAI_MODEL ?? "gpt-4o-mini"`. */
export const EXTRACTOR_MODEL =
  process.env.OPENAI_EXTRACTOR_MODEL ?? "gpt-4o-mini-2024-07-18";
export const EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

const DEFAULT_TIMEOUT_MS = 20_000;

let _client: OpenAI | null = null;

/** The single shared SDK instance. `maxRetries: 0` because we own retry/backoff below.
 * Honors OPENAI_BASE_URL for EU data-residency projects (https://eu.api.openai.com/v1) or a
 * local/self-hosted OpenAI-compatible endpoint; falls back to the SDK default when unset. */
export function modelClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  if (!_client) {
    _client = new OpenAI({
      apiKey: key,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
      maxRetries: 0,
    });
  }
  return _client;
}

export type StructuredError =
  | "no_client"
  | "timeout"
  | "refusal"
  | "empty"
  | "api_error";

export type StructuredResult<T> =
  | { ok: true; data: T; modelVersion: string; attempts: number }
  | { ok: false; error: StructuredError; attempts: number };

export type StructuredCallOptions<T> = {
  system: string;
  user: string;
  /** Validated output contract. The model is forced to emit JSON matching this. */
  schema: ZodType<T>;
  /** Stable, snake_or_camel name for the response_format json_schema. */
  jsonSchemaName: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Number of retries on transient failure (default 2 => up to 3 attempts). */
  retries?: number;
  timeoutMs?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Jittered exponential backoff: ~150ms, ~300ms, ~600ms … with up to 50% jitter. */
function backoffMs(attemptIndex: number): number {
  const base = 150 * 2 ** attemptIndex;
  return base + Math.floor(Math.random() * base * 0.5);
}

function isTimeout(err: unknown): boolean {
  const name = (err as { name?: string })?.name ?? "";
  const code = (err as { code?: string })?.code ?? "";
  return name === "APIConnectionTimeoutError" || code === "ETIMEDOUT";
}

/**
 * JSON-schema-validated, version-pinned, retried/timed-out call. Uses
 * `chat.completions.parse` with a zod-derived `response_format` (openai v6). Returns the parsed,
 * schema-valid object or a typed error.
 */
export async function callStructured<T>(
  opts: StructuredCallOptions<T>
): Promise<StructuredResult<T>> {
  const client = modelClient();
  if (!client) return { ok: false, error: "no_client", attempts: 0 };

  const retries = opts.retries ?? 2;
  const model = opts.model ?? EXTRACTOR_MODEL;
  let attempts = 0;
  let lastError: StructuredError = "api_error";

  for (let i = 0; i <= retries; i++) {
    attempts++;
    try {
      const completion = await client.chat.completions.parse(
        {
          model,
          ...tuningParams(model, {
            maxTokens: opts.maxTokens,
            temperature: opts.temperature ?? 0.2,
          }),
          messages: [
            { role: "system", content: opts.system },
            { role: "user", content: opts.user },
          ],
          response_format: zodResponseFormat(opts.schema, opts.jsonSchemaName),
        },
        { timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS }
      );

      const message = completion.choices[0]?.message;
      if (message?.refusal) {
        lastError = "refusal";
      } else if (message?.parsed == null) {
        lastError = "empty";
      } else {
        return {
          ok: true,
          data: message.parsed as T,
          modelVersion: completion.model ?? model,
          attempts,
        };
      }
    } catch (err) {
      lastError = isTimeout(err) ? "timeout" : "api_error";
      console.error(`[inkwell] callStructured attempt ${attempts} failed:`, err);
    }
    if (i < retries) await sleep(backoffMs(i));
  }

  return { ok: false, error: lastError, attempts };
}

export type TextCallOptions = {
  system: string;
  user: string;
  model?: string;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  maxTokens: number;
  retries?: number;
  timeoutMs?: number;
};

/**
 * Plain-text variant with retry/timeout, so prose generators (e.g. the hypothesis nudge writer)
 * get reliability without the structured-output contract. Returns trimmed text or null.
 */
export async function callText(opts: TextCallOptions): Promise<string | null> {
  const client = modelClient();
  if (!client) return null;

  const retries = opts.retries ?? 1;
  const model = opts.model ?? EXTRACTOR_MODEL;

  for (let i = 0; i <= retries; i++) {
    try {
      const completion = await client.chat.completions.create(
        {
          model,
          ...tuningParams(model, {
            maxTokens: opts.maxTokens,
            temperature: opts.temperature ?? 0.7,
            topP: opts.topP,
            frequencyPenalty: opts.frequencyPenalty,
            presencePenalty: opts.presencePenalty,
          }),
          messages: [
            { role: "system", content: opts.system },
            { role: "user", content: opts.user },
          ],
        },
        { timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS }
      );
      const text = completion.choices[0]?.message?.content?.trim();
      if (text) return text;
    } catch (err) {
      console.error(`[inkwell] callText attempt ${i + 1} failed:`, err);
    }
    if (i < retries) await sleep(backoffMs(i));
  }
  return null;
}

/** Embed text for migration 010 retrieval. Returns the vector + the pinned model version. */
export async function embed(
  text: string
): Promise<{ embedding: number[]; modelVersion: string } | null> {
  const client = modelClient();
  if (!client) return null;
  try {
    const response = await client.embeddings.create(
      { model: EMBEDDING_MODEL, input: text },
      { timeout: DEFAULT_TIMEOUT_MS }
    );
    const embedding = response.data[0]?.embedding;
    if (!embedding) return null;
    return { embedding, modelVersion: response.model ?? EMBEDDING_MODEL };
  } catch (err) {
    console.error("[inkwell] embed failed:", err);
    return null;
  }
}
