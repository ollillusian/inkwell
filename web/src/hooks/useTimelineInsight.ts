"use client";

import { useCallback, useRef, useState } from "react";
import type {
  DirectorsCutInput,
  TimelineFrameInsightInput,
} from "@/lib/llm/generateTimelineInsight";

type FetchState = "idle" | "loading" | "error" | "done";

export function useTimelineInsight() {
  const memoryCache = useRef(new Map<string, string>());
  const [state, setState] = useState<FetchState>("idle");
  const [error, setError] = useState<string | null>(null);

  const fetchInsight = useCallback(
    async (
      cacheKey: string,
      body:
        | { kind: "frame"; input: TimelineFrameInsightInput }
        | { kind: "directors_cut"; input: DirectorsCutInput }
    ): Promise<string | null> => {
      const hit = memoryCache.current.get(cacheKey);
      if (hit) return hit;

      setState("loading");
      setError(null);

      try {
        const res = await fetch("/api/journal/timeline-insight", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, cacheKey }),
        });
        const data = (await res.json()) as {
          insight?: string;
          error?: string;
        };
        if (!res.ok) {
          setState("error");
          setError(data.error ?? "Could not generate");
          return null;
        }
        if (data.insight) {
          memoryCache.current.set(cacheKey, data.insight);
          setState("done");
          return data.insight;
        }
        setState("error");
        setError("Empty response");
        return null;
      } catch {
        setState("error");
        setError("Network error");
        return null;
      }
    },
    []
  );

  const reset = useCallback(() => {
    setState("idle");
    setError(null);
  }, []);

  return { fetchInsight, state, error, reset };
}
