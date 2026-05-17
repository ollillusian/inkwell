"use client";

import {
  DEFAULT_NUDGE_SCHEDULE,
  newNudgeId,
  type Nudge,
  type NudgeScheduleConfig,
} from "@/lib/nudges";

type Props = {
  config: NudgeScheduleConfig;
  onChange: (config: NudgeScheduleConfig) => void;
};

export function NudgeScheduleEditor({ config, onChange }: Props) {
  function updateNudge(index: number, patch: Partial<Nudge>) {
    const nudges = [...config.nudges];
    nudges[index] = { ...nudges[index], ...patch };
    onChange({ ...config, nudges });
  }

  function removeNudge(index: number) {
    onChange({
      ...config,
      nudges: config.nudges.filter((_, i) => i !== index),
    });
  }

  function addNudge(preset?: Partial<Nudge>) {
    onChange({
      ...config,
      nudges: [
        ...config.nudges,
        {
          id: newNudgeId(),
          label: "New nudge",
          time: "15:00",
          enabled: true,
          kind: "daily",
          ...preset,
        },
      ],
    });
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-muted leading-relaxed">
        Add as many nudges as you like — travel mid-morning, afternoon pause, before bed.
        With spontaneity on, each daily nudge shifts by a few minutes so it
        feels less like an alarm.
      </p>

      {config.nudges.map((nudge, i) => (
        <div
          key={nudge.id}
          className="rounded-2xl border border-ink-border bg-ink-surface p-4 space-y-3"
        >
          <div className="flex items-start justify-between gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={nudge.enabled}
                onChange={(e) => updateNudge(i, { enabled: e.target.checked })}
              />
              On
            </label>
            {nudge.kind === "once" && (
              <span className="text-xs text-ink-accent uppercase tracking-wide">
                One-time
              </span>
            )}
          </div>
          <input
            type="text"
            value={nudge.label}
            onChange={(e) => updateNudge(i, { label: e.target.value })}
            placeholder="Label, e.g. Before bed"
            className="w-full rounded-lg border border-ink-border bg-ink-bg px-3 py-2 text-sm"
          />
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>Around</span>
            <input
              type="time"
              value={nudge.time}
              onChange={(e) => updateNudge(i, { time: e.target.value })}
              className="rounded-lg border border-ink-border bg-ink-bg px-3 py-2"
            />
          </label>
          {config.nudges.length > 1 && (
            <button
              type="button"
              onClick={() => removeNudge(i)}
              className="text-xs text-ink-muted hover:text-red-700"
            >
              Remove
            </button>
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => addNudge()}
          className="text-sm rounded-full border border-ink-border px-4 py-2 hover:bg-ink-surface"
        >
          + Daily nudge
        </button>
        <button
          type="button"
          onClick={() =>
            addNudge({
              id: "travel",
              label: "Travel",
              time: "10:30",
              kind: "daily",
              topicHint: "travel",
              enabled: true,
            })
          }
          className="text-sm rounded-full border border-ink-accent/40 text-ink-accent px-4 py-2 hover:bg-ink-accent/10"
        >
          + Travel (daily)
        </button>
      </div>

      <div className="rounded-2xl border border-ink-border/60 p-4 space-y-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={config.spontaneous}
            onChange={(e) =>
              onChange({ ...config, spontaneous: e.target.checked })
            }
          />
          <span className="text-sm">Spontaneous timing (± jitter on daily nudges)</span>
        </label>
        {config.spontaneous && (
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>Jitter (minutes)</span>
            <input
              type="number"
              min={0}
              max={120}
              value={config.jitterMinutes}
              onChange={(e) =>
                onChange({
                  ...config,
                  jitterMinutes: Number(e.target.value) || 0,
                })
              }
              className="w-20 rounded-lg border border-ink-border px-2 py-1"
            />
          </label>
        )}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={config.surpriseNudge.enabled}
            onChange={(e) =>
              onChange({
                ...config,
                surpriseNudge: {
                  ...config.surpriseNudge,
                  enabled: e.target.checked,
                },
              })
            }
          />
          <span className="text-sm">One surprise nudge somewhere in the day</span>
        </label>
        {config.surpriseNudge.enabled && (
          <div className="flex gap-3 text-sm">
            <label className="flex-1">
              From
              <input
                type="time"
                value={config.surpriseNudge.windowStart}
                onChange={(e) =>
                  onChange({
                    ...config,
                    surpriseNudge: {
                      ...config.surpriseNudge,
                      windowStart: e.target.value,
                    },
                  })
                }
                className="mt-1 w-full rounded-lg border border-ink-border px-2 py-1"
              />
            </label>
            <label className="flex-1">
              To
              <input
                type="time"
                value={config.surpriseNudge.windowEnd}
                onChange={(e) =>
                  onChange({
                    ...config,
                    surpriseNudge: {
                      ...config.surpriseNudge,
                      windowEnd: e.target.value,
                    },
                  })
                }
                className="mt-1 w-full rounded-lg border border-ink-border px-2 py-1"
              />
            </label>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => onChange(DEFAULT_NUDGE_SCHEDULE)}
        className="text-xs text-ink-muted underline"
      >
        Reset to defaults (before bed + afternoon)
      </button>
    </div>
  );
}
