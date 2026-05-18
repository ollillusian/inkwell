"use client";

import type { EntryGraphPoint } from "@/lib/journal";

const SLOT_COLORS: Record<string, string> = {
  morning: "#c4a574",
  midday: "#8b9e8b",
  evening: "#7a8ba8",
  bedtime: "#6b5b7a",
  travel: "#a88b6b",
};

function colorForSlot(slot: string): string {
  if (SLOT_COLORS[slot]) return SLOT_COLORS[slot];
  let hash = 0;
  for (let i = 0; i < slot.length; i++) hash = slot.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 35% 55%)`;
}

type Props = {
  points: EntryGraphPoint[];
};

export function EntryDayGraph({ points }: Props) {
  if (points.length === 0) return null;

  const width = 320;
  const height = 140;
  const pad = { l: 28, r: 12, t: 16, b: 28 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const maxWords = Math.max(...points.map((p) => p.words), 1);

  const ticks = [6, 12, 18];

  return (
    <figure className="rounded-2xl border border-ink-border bg-ink-surface/50 p-4">
      <figcaption className="text-xs text-ink-muted mb-3 leading-relaxed">
        When you wrote (left to right) and how much you wrote (taller bar).
        Colors match your nudges.
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full max-w-sm mx-auto"
        role="img"
        aria-label="Timeline of journal entries by time of day and word count"
      >
        {ticks.map((h) => {
          const x = pad.l + (h / 24) * innerW;
          return (
            <g key={h}>
              <line
                x1={x}
                y1={pad.t}
                x2={x}
                y2={pad.t + innerH}
                stroke="currentColor"
                strokeOpacity={0.08}
              />
              <text
                x={x}
                y={height - 6}
                textAnchor="middle"
                className="fill-ink-muted text-[9px]"
              >
                {h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`}
              </text>
            </g>
          );
        })}
        {points.map((p) => {
          const x = pad.l + (p.minutes / (24 * 60)) * innerW;
          const barH = Math.max(8, (p.words / maxWords) * innerH * 0.85);
          const y = pad.t + innerH - barH;
          const color = colorForSlot(p.slot);
          return (
            <g key={p.id}>
              <rect
                x={x - 6}
                y={y}
                width={12}
                height={barH}
                rx={3}
                fill={color}
                fillOpacity={0.85}
              />
              <circle cx={x} cy={pad.t + innerH + 2} r={3} fill={color} />
              <title>
                {p.label} at {p.timeLabel} — {p.words} words
              </title>
            </g>
          );
        })}
        <line
          x1={pad.l}
          y1={pad.t + innerH}
          x2={pad.l + innerW}
          y2={pad.t + innerH}
          stroke="currentColor"
          strokeOpacity={0.15}
        />
      </svg>
      <ul className="mt-3 flex flex-wrap gap-2 text-[10px] text-ink-muted">
        {points.map((p) => (
          <li key={p.id} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: colorForSlot(p.slot) }}
            />
            {p.label} · {p.timeLabel} · {p.words}w
          </li>
        ))}
      </ul>
    </figure>
  );
}
