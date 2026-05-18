"use client";

import type { DayThemeGraph } from "@/lib/themeGraph";

type Props = {
  graph: DayThemeGraph;
};

const TOPIC_FILL = "#c4a574";
const MOMENT_FILL = "#7a8ba8";

export function ThemeNetworkGraph({ graph }: Props) {
  const { nodes, edges } = graph;
  if (nodes.length === 0) return null;

  const width = 360;
  const height = 280;
  const maxEdge = Math.max(...edges.map((e) => e.weight), 1);
  const maxNode = Math.max(...nodes.map((n) => n.weight), 1);

  const pos = new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));

  return (
    <figure className="rounded-2xl border border-ink-border bg-gradient-to-b from-ink-surface/80 to-ink-bg p-4">
      <figcaption className="text-xs text-ink-muted mb-3 leading-relaxed">
        Themes from your writing, linked when they showed up together or flowed
        from one entry to the next. Inner ring: moments of the day.
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full max-w-md mx-auto"
        role="img"
        aria-label="Network graph of journal themes and how they connect"
      >
        <defs>
          <radialGradient id="topicGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={TOPIC_FILL} stopOpacity="0.35" />
            <stop offset="100%" stopColor={TOPIC_FILL} stopOpacity="0" />
          </radialGradient>
        </defs>
        {edges.map((edge) => {
          const a = pos.get(edge.source);
          const b = pos.get(edge.target);
          if (!a || !b) return null;
          const strokeW = 0.8 + (edge.weight / maxEdge) * 2.5;
          const opacity = 0.15 + (edge.weight / maxEdge) * 0.45;
          return (
            <line
              key={`${edge.source}-${edge.target}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="currentColor"
              strokeWidth={strokeW}
              strokeOpacity={opacity}
            />
          );
        })}
        {nodes.map((node) => {
          const r =
            node.kind === "topic"
              ? 14 + (node.weight / maxNode) * 12
              : 8 + (node.weight / maxNode) * 6;
          const fill = node.kind === "topic" ? TOPIC_FILL : MOMENT_FILL;
          const label =
            node.label.length > 22
              ? `${node.label.slice(0, 20)}…`
              : node.label;
          return (
            <g key={node.id}>
              {node.kind === "topic" && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={r + 10}
                  fill="url(#topicGlow)"
                />
              )}
              <circle
                cx={node.x}
                cy={node.y}
                r={r}
                fill={fill}
                fillOpacity={node.kind === "topic" ? 0.9 : 0.75}
                stroke="var(--ink-bg, #1a1814)"
                strokeWidth={1.5}
              />
              <text
                x={node.x}
                y={node.y + r + 11}
                textAnchor="middle"
                className="fill-ink-muted"
                style={{ fontSize: node.kind === "topic" ? 9 : 8 }}
              >
                {label}
              </text>
              <title>
                {node.label} · {node.weight}{" "}
                {node.kind === "topic" ? "mentions" : "entries"}
              </title>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
