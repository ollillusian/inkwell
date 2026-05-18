"use client";

import { useId, useMemo } from "react";
import type { DayThemeGraph, ThemeGraphEdge } from "@/lib/themeGraph";

type Props = {
  graph: DayThemeGraph;
};

function edgePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cx: number,
  cy: number,
  bend: number
): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const cpx = mx + (cx - mx) * bend;
  const cpy = my + (cy - my) * bend;
  return `M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`;
}

function edgeStyle(
  edge: ThemeGraphEdge,
  maxWeight: number
): { strokeWidth: number; opacity: number; dash?: string; bend: number } {
  const t = edge.weight / maxWeight;
  const base = {
    strokeWidth: 0.6 + t * 2.2,
    opacity: 0.12 + t * 0.38,
  };
  switch (edge.kind) {
    case "cooccur":
      return { ...base, bend: 0.22, opacity: base.opacity + 0.08 };
    case "flow":
      return { ...base, dash: "4 5", bend: 0.35 };
    default:
      return { ...base, bend: 0.12, opacity: base.opacity + 0.05 };
  }
}

export function ThemeNetworkGraph({ graph }: Props) {
  const uid = useId().replace(/:/g, "");
  const { nodes, edges, width, height, centerX, centerY } = graph;

  const maxEdge = useMemo(
    () => Math.max(...edges.map((e) => e.weight), 1),
    [edges]
  );
  const maxNode = useMemo(
    () => Math.max(...nodes.map((n) => n.weight), 1),
    [nodes]
  );

  const pos = useMemo(
    () => new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }])),
    [nodes]
  );

  if (nodes.length === 0) {
    return (
      <figure className="theme-graph rounded-2xl border border-ink-border bg-ink-surface/60 px-6 py-12 text-center">
        <p className="text-sm text-ink-muted">No themes to map yet for this day.</p>
      </figure>
    );
  }

  const topicNodes = nodes.filter((n) => n.kind === "topic");
  const momentNodes = nodes.filter((n) => n.kind === "moment");

  return (
    <figure className="theme-graph overflow-hidden rounded-2xl border border-ink-border bg-[radial-gradient(ellipse_85%_70%_at_50%_45%,#fffdf9_0%,#f0ebe3_55%,#e8e2d8_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
      <div className="px-4 pt-4 pb-1 flex items-start justify-between gap-3">
        <p className="text-xs text-ink-muted leading-relaxed max-w-[70%]">
          How your themes met and moved across the day. Thicker lines = stronger
          links.
        </p>
        <div className="flex flex-col gap-1.5 text-[10px] text-ink-muted shrink-0">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-ink-accent/80" />
            Theme
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-sm rotate-45 border border-[#8a9bab]"
              style={{ background: "rgba(138,155,171,0.35)" }}
            />
            Moment
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto block theme-graph-svg"
        role="img"
        aria-label="Network graph of journal themes and how they connect"
      >
        <defs>
          <radialGradient id={`${uid}-vignette`} cx="50%" cy="48%" r="55%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#d4cdc2" stopOpacity="0" />
          </radialGradient>
          <filter id={`${uid}-soft`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {topicNodes.map((n) => (
            <radialGradient
              key={`g-${n.id}`}
              id={`${uid}-node-${n.id}`}
              cx="35%"
              cy="30%"
              r="65%"
            >
              <stop offset="0%" stopColor="#fff" stopOpacity="0.45" />
              <stop offset="100%" stopColor={n.color} stopOpacity="1" />
            </radialGradient>
          ))}
        </defs>

        <ellipse
          cx={centerX}
          cy={centerY}
          rx={128}
          ry={118}
          fill={`url(#${uid}-vignette)`}
        />
        <circle
          cx={centerX}
          cy={centerY}
          r={22}
          fill="none"
          stroke="var(--ink-border)"
          strokeWidth={0.75}
          strokeOpacity={0.5}
          strokeDasharray="2 4"
        />

        <g className="theme-graph-edges">
          {edges.map((edge, i) => {
            const a = pos.get(edge.source);
            const b = pos.get(edge.target);
            if (!a || !b) return null;
            const style = edgeStyle(edge, maxEdge);
            const path = edgePath(
              a.x,
              a.y,
              b.x,
              b.y,
              centerX,
              centerY,
              style.bend
            );
            return (
              <path
                key={`${edge.source}-${edge.target}`}
                d={path}
                fill="none"
                stroke="var(--ink-accent)"
                strokeWidth={style.strokeWidth}
                strokeOpacity={style.opacity}
                strokeDasharray={style.dash}
                strokeLinecap="round"
                className="theme-graph-edge"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <title>
                  {edge.kind === "flow"
                    ? "Flow between entries"
                    : edge.kind === "cooccur"
                      ? "Appeared together"
                      : "Theme at this moment"}
                </title>
              </path>
            );
          })}
        </g>

        <g className="theme-graph-nodes" filter={`url(#${uid}-soft)`}>
          {momentNodes.map((node, i) => {
            const s = 10 + (node.weight / maxNode) * 5;
            return (
              <g
                key={node.id}
                className="theme-graph-node"
                style={{ animationDelay: `${120 + i * 60}ms` }}
              >
                <polygon
                  points={`${node.x},${node.y - s} ${node.x + s},${node.y} ${node.x},${node.y + s} ${node.x - s},${node.y}`}
                  fill={node.color}
                  fillOpacity={0.35}
                  stroke={node.color}
                  strokeWidth={1.25}
                />
                <text
                  x={node.x}
                  y={node.y + s + 12}
                  textAnchor="middle"
                  className="fill-ink-muted font-sans"
                  style={{ fontSize: 9, letterSpacing: "0.02em" }}
                >
                  {node.shortLabel}
                </text>
                <title>
                  {node.label} · {node.weight}{" "}
                  {node.weight === 1 ? "entry" : "entries"}
                </title>
              </g>
            );
          })}

          {topicNodes.map((node, i) => {
            const r = 16 + (node.weight / maxNode) * 10;
            const labelY = node.y + r + 14;
            return (
              <g
                key={node.id}
                className="theme-graph-node"
                style={{ animationDelay: `${80 + i * 70}ms` }}
              >
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={r + 8}
                  fill={node.color}
                  fillOpacity={0.12}
                />
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={r}
                  fill={`url(#${uid}-node-${node.id})`}
                  stroke={node.color}
                  strokeWidth={2}
                />
                <circle
                  cx={node.x - r * 0.25}
                  cy={node.y - r * 0.28}
                  r={r * 0.22}
                  fill="#fff"
                  fillOpacity={0.35}
                />
                <rect
                  x={node.x - 52}
                  y={labelY - 9}
                  width={104}
                  height={16}
                  rx={8}
                  fill="var(--ink-surface)"
                  fillOpacity={0.92}
                  stroke="var(--ink-border)"
                  strokeWidth={0.5}
                />
                <text
                  x={node.x}
                  y={labelY + 3}
                  textAnchor="middle"
                  className="fill-ink-fg font-sans"
                  style={{ fontSize: 9.5, fontWeight: 500 }}
                >
                  {node.shortLabel}
                </text>
                <title>
                  {node.label} · {node.weight}{" "}
                  {node.weight === 1 ? "mention" : "mentions"}
                </title>
              </g>
            );
          })}
        </g>
      </svg>
    </figure>
  );
}
