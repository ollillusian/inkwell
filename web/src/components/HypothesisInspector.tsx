"use client";

import { useEffect, useState, type ReactNode } from "react";
import type {
  Hypothesis,
  HypothesisEvidence,
  HypothesisNudgeOutcome,
  HypothesisFramework,
} from "@/types/database";
import { describePattern, STATUS_LABEL, logOddsToPct } from "@/lib/hypotheses/taxonomy";

type InspectState = {
  userId: string;
  hypotheses: Hypothesis[];
  evidence: HypothesisEvidence[];
  outcomes: HypothesisNudgeOutcome[];
  log: { entry_id: string; events_found: number; processed_at: string }[];
  deliveries: { delivery_date: string; prompt_slot: string; prompt_text: string }[];
};

type TraceHypothesis = {
  framework: string;
  category: string;
  statement: string;
  externalizedLabel: string | null;
  watchedDisconfirmers: string[];
  confidenceCeiling: number;
  wouldSeedCandidate: boolean;
};
type TraceEvent = {
  quote: string;
  framework: string;
  category: string;
  label?: string;
  stance: "supporting" | "contradicting";
  evidenceFor: string;
  evidenceAgainst: string;
  situationalContext: string;
  weightBand: "weak" | "moderate" | "strong";
};
type TraceResult = {
  signals: {
    absolutist_rolling_pct: number;
    first_person_singular_density: number;
    past_focus_ratio: number;
  };
  hypotheses: TraceHypothesis[];
  extraction: { requested: number; succeeded: number; events: TraceEvent[] };
};
type ProcSummary = {
  reset: boolean;
  scanned: number;
  processed: number;
  skipped: number;
  errors: number;
  bySkip: Record<string, number>;
};
type NudgeResult = {
  hypothesis?: { framework: string; category: string; status: string; statement: string };
  nudge?: string | null;
  gate?: { ok: boolean; reason?: string } | null;
  error?: string;
};

const bandTone: Record<string, string> = {
  strong: "text-red-700 bg-red-700/10",
  moderate: "text-amber-700 bg-amber-700/10",
  weak: "text-ink-muted bg-ink-muted/10",
};

function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "ok" | "bad" | "accent" }) {
  const tones = {
    muted: "text-ink-muted bg-ink-muted/10",
    ok: "text-ink-fg bg-ink-fg/10",
    bad: "text-red-700 bg-red-700/10",
    accent: "text-ink-accent bg-ink-accent/10",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

const CARD = "rounded-xl border border-ink-muted/15 p-4";
const PRIMARY = "rounded-full bg-ink-fg text-ink-bg px-5 py-2.5 text-sm font-medium disabled:opacity-40";
const SECONDARY = "rounded-full border border-ink-muted/40 px-5 py-2.5 text-sm font-medium disabled:opacity-40";
const FIELD = "rounded-xl border border-ink-muted/25 px-3 py-2.5 text-sm bg-transparent";

export function HypothesisInspector() {
  const [users, setUsers] = useState<{ id: string; email: string | null; entries: number }[]>([]);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<InspectState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reset, setReset] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [procSummary, setProcSummary] = useState<ProcSummary | null>(null);
  const [nudging, setNudging] = useState(false);
  const [nudgeResult, setNudgeResult] = useState<NudgeResult | null>(null);

  const [text, setText] = useState(
    "Took the afternoon off and felt guilty the whole time. I always feel like I have to earn the right to rest."
  );
  const [trace, setTrace] = useState<TraceResult | null>(null);
  const [tracing, setTracing] = useState(false);

  useEffect(() => {
    fetch("/api/dev/hypotheses")
      .then((r) => r.json())
      .then((d) => {
        const us: { id: string; email: string | null; entries: number }[] = d.users ?? [];
        setUsers(us);
        // Default to the live /app journal: the seeded `test@inkwell.local`, else whoever has the
        // most entries (the real journal). Auto-load it so /dev opens straight onto current state.
        const chosen =
          us.find((u) => u.email === "test@inkwell.local")?.email ??
          [...us].sort((a, b) => (b.entries ?? 0) - (a.entries ?? 0))[0]?.email;
        if (chosen) {
          setEmail(chosen);
          void loadFor(chosen);
        }
      })
      .catch(() => {});
  }, []);

  async function post(body: unknown) {
    const res = await fetch("/api/dev/hypotheses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Request failed");
    return data;
  }

  async function loadFor(targetEmail: string) {
    if (!targetEmail.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dev/hypotheses?email=${encodeURIComponent(targetEmail)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setState(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }
  const load = () => loadFor(email);

  async function processJournal() {
    setProcessing(true);
    setProcSummary(null);
    setError(null);
    try {
      const data = await post({ action: "process", email, reset });
      setProcSummary(data);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setProcessing(false);
    }
  }

  async function genNudge() {
    setNudging(true);
    setNudgeResult(null);
    setError(null);
    try {
      setNudgeResult(await post({ action: "nudge", email }));
    } catch (e) {
      setNudgeResult({ error: e instanceof Error ? e.message : "Failed" });
    } finally {
      setNudging(false);
    }
  }

  async function runTrace() {
    setTracing(true);
    setTrace(null);
    setError(null);
    try {
      setTrace(await post({ text }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setTracing(false);
    }
  }

  const evidenceFor = (hid: string) => state?.evidence.filter((e) => e.hypothesis_id === hid) ?? [];

  return (
    <div className="px-6 py-12 max-w-2xl mx-auto space-y-12 border-t border-ink-muted/15 mt-12">
      <header>
        <h1 className="font-serif text-3xl">Hypothesis inspector</h1>
        <p className="mt-2 text-sm text-ink-muted">
          The engine is invisible to users — this is the developer window into what it believes and why.
        </p>
      </header>

      {error && (
        <p className="text-sm text-red-700 bg-red-700/10 rounded-xl px-4 py-3">{error}</p>
      )}

      {/* ───────── Trace ───────── */}
      <section className="space-y-4">
        <div className="flex items-baseline gap-3">
          <h2 className="font-serif text-xl">Trace an entry</h2>
          <Pill>live · no DB writes</Pill>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className={`${FIELD} w-full`}
        />
        <button type="button" onClick={runTrace} disabled={tracing || !text.trim()} className={PRIMARY}>
          {tracing ? "Reasoning…" : "Trace reasoning"}
        </button>

        {trace && (
          <div className="space-y-4 pt-1">
            <div className="flex flex-wrap gap-2">
              <Pill>samples {trace.extraction.succeeded}/{trace.extraction.requested}</Pill>
              <Pill>absolutist {trace.signals.absolutist_rolling_pct}%</Pill>
            </div>

            {trace.hypotheses.map((h, i) => (
              <div key={i} className={`${CARD} border-ink-accent/30`}>
                <div className="flex items-start justify-between gap-2">
                  <PatternLabel framework={h.framework} category={h.category} />
                  <Pill tone={h.wouldSeedCandidate ? "accent" : "muted"}>
                    {h.wouldSeedCandidate ? "would seed a candidate" : "would not seed"}
                  </Pill>
                </div>
                <p className="mt-2 text-sm">{h.statement}</p>
                <p className="mt-2 text-xs text-ink-muted">
                  one entry only seeds a candidate — promotion needs ≥3 spontaneous days across ≥2 situations.
                </p>
              </div>
            ))}

            {trace.extraction.events.length === 0 ? (
              <p className="text-sm text-ink-muted">Nothing notable — no events survived.</p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-wide text-ink-muted">Evidence &amp; reasoning</p>
                {trace.extraction.events.map((ev, i) => (
                  <div key={i} className={CARD}>
                    <div className="flex items-start justify-between gap-2">
                      <PatternLabel framework={ev.framework} category={ev.category} />
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${bandTone[ev.weightBand]}`}>
                        {ev.stance} · {ev.weightBand}
                      </span>
                    </div>
                    <blockquote className="font-serif text-lg mt-2 border-l-2 border-ink-accent pl-3">
                      {ev.quote}
                    </blockquote>
                    <dl className="mt-3 space-y-1 text-xs">
                      <Row k="for" v={ev.evidenceFor} />
                      <Row k="against" v={ev.evidenceAgainst} />
                      <Row k="situational" v={ev.situationalContext} />
                    </dl>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ───────── Real hypotheses ───────── */}
      <section className="space-y-4">
        <div className="flex items-baseline gap-3">
          <h2 className="font-serif text-xl">Real hypotheses</h2>
          <Pill>real LLM + DB writes</Pill>
        </div>
        <p className="-mt-1 text-sm text-ink-muted">Run the engine over a user&rsquo;s real journal, then view what it forms.</p>

        <input
          list="hyp-users"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user email"
          className={`${FIELD} w-full`}
        />
        <datalist id="hyp-users">
          {users.map((u) => (
            <option key={u.id} value={u.email ?? ""}>
              {u.entries} entries
            </option>
          ))}
        </datalist>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={load} disabled={loading || !email.trim()} className={SECONDARY}>
            {loading ? "Loading…" : "Load"}
          </button>
          <button type="button" onClick={processJournal} disabled={processing || !email.trim()} className={PRIMARY}>
            {processing ? "Processing…" : "Process journal"}
          </button>
          <button type="button" onClick={genNudge} disabled={nudging || !email.trim()} className={SECONDARY}>
            {nudging ? "Writing…" : "Generate nudge"}
          </button>
          <label
            className="flex items-center gap-1.5 text-xs text-ink-muted ml-auto"
            title="On: wipe this user's hypotheses, evidence & embeddings, then rebuild from their whole journal. Off: only process new entries (incremental, like the real cron)."
          >
            <input type="checkbox" checked={reset} onChange={(e) => setReset(e.target.checked)} />
            rebuild from scratch
          </label>
        </div>

        {procSummary && (
          <p className="text-xs text-ink-muted">
            {procSummary.reset ? "reset · " : ""}processed {procSummary.processed}/{procSummary.scanned}
            {procSummary.skipped ? ` · skipped ${procSummary.skipped}` : ""}
            {Object.keys(procSummary.bySkip).length ? ` (${Object.entries(procSummary.bySkip).map(([k, v]) => `${k} ${v}`).join(", ")})` : ""}
          </p>
        )}

        {nudgeResult && (
          nudgeResult.error ? (
            <p className="text-sm text-ink-muted bg-ink-muted/10 rounded-xl px-4 py-3">{nudgeResult.error}</p>
          ) : (
            <div className={`${CARD} border-ink-accent/30`}>
              <div className="flex items-start justify-between gap-2">
                <PatternLabel
                  framework={nudgeResult.hypothesis?.framework ?? ""}
                  category={nudgeResult.hypothesis?.category ?? ""}
                />
                <div className="flex gap-2">
                  <Pill tone={nudgeResult.gate?.ok ? "ok" : "bad"}>
                    gate {nudgeResult.gate?.ok ? "✓" : nudgeResult.gate?.reason ?? "—"}
                  </Pill>
                  <Pill>dev preview</Pill>
                </div>
              </div>
              <blockquote className="font-serif text-xl mt-3 border-l-2 border-ink-accent pl-3">
                {nudgeResult.nudge ?? "(no nudge — would fall back to content-blind)"}
              </blockquote>
            </div>
          )
        )}

        {state && (
          <div className="space-y-3 pt-1">
            {state.hypotheses.length === 0 ? (
              <p className="text-sm text-ink-muted">No hypotheses yet — try Process journal.</p>
            ) : (
              state.hypotheses.map((h) => (
                <div key={h.id} className={CARD}>
                  <div className="flex items-start justify-between gap-2">
                    <PatternLabel framework={h.framework} category={h.category} />
                    <div className="text-right shrink-0">
                      <Pill
                        tone={
                          h.status === "active" || h.status === "supported"
                            ? "ok"
                            : h.status === "refuted" || h.status === "retired"
                              ? "bad"
                              : "muted"
                        }
                      >
                        {STATUS_LABEL[h.status]}
                      </Pill>
                      <div className="text-[10px] text-ink-muted mt-1">
                        confidence {logOddsToPct(h.evidence_tally)}% · cap {logOddsToPct(h.confidence_ceiling)}%
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-sm">{h.statement}</p>
                  <p className="mt-2 text-xs text-ink-muted">
                    {h.supporting_count} for · {h.contradicting_count} against · {h.spontaneous_supporting_days} days · {h.distinct_situation_count} situations
                  </p>
                  <div className="mt-3 space-y-2">
                    {evidenceFor(h.id).map((e) => (
                      <div key={e.id} className="border-l-2 border-ink-muted/25 pl-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${bandTone[e.weight_band]}`}>
                          {e.stance} · {e.weight_band}
                        </span>
                        <p className="font-serif text-sm mt-1">&ldquo;{e.quote}&rdquo;</p>
                        {e.situational_context && (
                          <p className="text-xs text-ink-muted mt-0.5">situational: {e.situational_context}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function PatternLabel({ framework, category }: { framework: string; category: string | null }) {
  const d = describePattern(framework as HypothesisFramework, category || "uncategorized");
  // Plain language only; the raw slug stays in the hover title for developer reference.
  return (
    <span className="min-w-0 text-sm" title={d.technical}>
      <span className="font-medium">{d.kind}</span>
      <span className="text-ink-muted"> · {d.theme}</span>
    </span>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <span className="text-ink-muted">{k}:</span> {v || "—"}
    </div>
  );
}
