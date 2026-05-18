"use client";

import { useCallback, useId, useMemo, useState } from "react";
import type {
  DayThemeGraph,
  ThemeGraphEdge,
  ThemeGraphNode,
} from "@/lib/themeGraph";

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

function edgeMeta(edge: ThemeGraphEdge, maxWeight: number) {
  const t = edge.weight / maxWeight;
  return {
    strokeWidth: 0.75 + t * 2,
    bend:
      edge.kind === "cooccur" ? 0.2 : edge.kind === "flow" ? 0.32 : 0.1,
    dash: edge.kind === "flow" ? "5 6" : undefined,
    label:
      edge.kind === "flow"
        ? "Carried from one entry to the next"
        : edge.kind === "cooccur"
          ? "Appeared in the same entry"
          : "Linked to this moment",
  };
}

function buildAdjacency(edges: ThemeGraphEdge[]) {
  const neighbors = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (!neighbors.has(a)) neighbors.set(a, new Set());
    neighbors.get(a)!.add(b);
  };
  for (const e of edges) {
    add(e.source, e.target);
    add(e.target, e.source);
  }
  return neighbors;
}

function edgeKindLabel(kind: ThemeGraphEdge["kind"]): string {
  switch (kind) {
    case "flow":
      return "Flow between entries";
    case "cooccur":
      return "Same entry";
    default:
      return "Moment link";
  }
}

export function ThemeNetworkGraph({ graph }: Props) {
  const uid = useId().replace(/:/g, "");
  const { nodes, edges, width, height, centerX, centerY } = graph;

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const activeId = selectedId ?? hoveredId;

  const maxEdge = useMemo(
    () => Math.max(...edges.map((e) => e.weight), 1),
    [edges]
  );
  const maxNode = useMemo(
    () => Math.max(...nodes.map((n) => n.weight), 1),
    [nodes]
  );

  const nodeById = useMemo(
    () => new Map(nodes.map((n) => [n.id, n])),
    [nodes]
  );

  const pos = useMemo(
    () => new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }])),
    [nodes]
  );

  const neighbors = useMemo(() => buildAdjacency(edges), [edges]);

  const highlightIds = useMemo(() => {
    if (!activeId) return null;
    const set = new Set<string>([activeId]);
    for (const id of neighbors.get(activeId) ?? []) set.add(id);
    return set;
  }, [activeId, neighbors]);

  const isEdgeLit = useCallback(
    (edge: ThemeGraphEdge) => {
      if (!highlightIds) return true;
      return (
        highlightIds.has(edge.source) && highlightIds.has(edge.target)
      );
    },
    [highlightIds]
  );

  const isNodeLit = useCallback(
    (id: string) => !highlightIds || highlightIds.has(id),
    [highlightIds]
  );

  const selectNode = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedId(null);
  }, []);

  const activeNode: ThemeGraphNode | null = activeId
    ? (nodeById.get(activeId) ?? null)
    : null;

  const connectedEdges = useMemo(() => {
    if (!activeId) return [];
    return edges.filter(
      (e) => e.source === activeId || e.target === activeId
    );
  }, [activeId, edges]);

  if (nodes.length === 0) {
    return (
      <figure className="rounded-2xl border border-ink-border bg-ink-surface/60 px-6 py-12 text-center">
        <p className="text-sm text-ink-muted">No themes to map yet for this day.</p>
      </figure>
    );
  }

  const topicNodes = nodes.filter((n) => n.kind === "topic");
  const momentNodes = nodes.filter((n) => n.kind === "moment");

  return (
    <figure className="overflow-hidden rounded-2xl border border-ink-border bg-ink-surface/90">
      <div className="px-4 pt-4 pb-2 flex flex-wrap items-start justify-between gap-3">
        <p className="text-xs text-ink-muted leading-relaxed max-w-md">
          Tap or hover a theme or moment to see how your entries connect. Lines
          thicken where links are stronger.
        </p>
        <div className="flex gap-4 text-[10px] text-ink-muted shrink-0">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full border-2 border-ink-accent bg-ink-accent/25" />
            Theme
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full border border-ink-muted bg-ink-bg" />
            Moment
          </span>
        </div>
      </div>

      <div
        className="relative touch-pan-y"
        onMouseLeave={() => setHoveredId(null)}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto block theme-graph-svg select-none"
          role="img"
          aria-label="Interactive map of journal themes and how they connect"
          onClick={(e) => {
            if (e.target === e.currentTarget) clearSelection();
          }}
        >
          <defs>
            <radialGradient id={`${uid}-wash`} cx="50%" cy="48%" r="52%">
              <stop offset="0%" stopColor="var(--ink-surface)" stopOpacity="0.9" />
              <stop offset="100%" stopColor="var(--ink-bg)" stopOpacity="0" />
            </radialGradient>
          </defs>

          <rect
            width={width}
            height={height}
            fill={`url(#${uid}-wash)`}
            className="pointer-events-none"
          />
          <circle
            cx={centerX}
            cy={centerY}
            r={24}
            fill="none"
            stroke="var(--ink-border)"
            strokeWidth={0.75}
            strokeOpacity={0.65}
            strokeDasharray="3 5"
            className="pointer-events-none"
          />

          <g className="theme-graph-edges pointer-events-none">
            {edges.map((edge, i) => {
              const a = pos.get(edge.source);
              const b = pos.get(edge.target);
              if (!a || !b) return null;
              const meta = edgeMeta(edge, maxEdge);
              const lit = isEdgeLit(edge);
              const t = edge.weight / maxEdge;
              return (
                <path
                  key={`${edge.source}-${edge.target}-${edge.kind}`}
                  d={edgePath(
                    a.x,
                    a.y,
                    b.x,
                    b.y,
                    centerX,
                    centerY,
                    meta.bend
                  )}
                  fill="none"
                  stroke={
                    lit && activeId
                      ? "var(--ink-accent)"
                      : "var(--ink-border)"
                  }
                  strokeWidth={lit ? meta.strokeWidth : meta.strokeWidth * 0.65}
                  strokeOpacity={
                    lit ? 0.22 + t * 0.45 : highlightIds ? 0.08 : 0.18 + t * 0.28
                  }
                  strokeDasharray={meta.dash}
                  strokeLinecap="round"
                  className="theme-graph-edge transition-[stroke,stroke-opacity,stroke-width] duration-200"
                  style={{ animationDelay: `${i * 35}ms` }}
                />
              );
            })}
          </g>

          <g className="theme-graph-nodes">
            {momentNodes.map((node, i) => {
              const r = 5 + (node.weight / maxNode) * 3;
              const lit = isNodeLit(node.id);
              const isActive = activeId === node.id;
              const labelY = node.y + r + 11;

              return (
                <g
                  key={node.id}
                  className={`theme-graph-node cursor-pointer outline-none${lit ? "" : " theme-graph-node-dim"}`}
                  style={{ animationDelay: `${100 + i * 50}ms` }}
                  onMouseEnter={() => setHoveredId(node.id)}
                  onMouseLeave={() =>
                    setHoveredId((h) => (h === node.id ? null : h))
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    selectNode(node.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      selectNode(node.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectedId === node.id}
                  aria-label={`${node.label}, ${node.weight} ${node.weight === 1 ? "entry" : "entries"}`}
                >
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={r + 14}
                    fill="transparent"
                  />
                  {isActive && (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={r + 10}
                      fill="none"
                      stroke="var(--ink-accent)"
                      strokeWidth={1}
                      strokeOpacity={0.35}
                    />
                  )}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={r}
                    fill="var(--ink-bg)"
                    stroke={
                      isActive ? "var(--ink-accent)" : "var(--ink-muted)"
                    }
                    strokeWidth={isActive ? 1.75 : 1.25}
                  />
                  <text
                    x={node.x}
                    y={labelY}
                    textAnchor="middle"
                    fill="var(--ink-muted)"
                    className="font-sans pointer-events-none"
                    style={{
                      fontSize: 8.5,
                      opacity: lit ? 1 : 0.5,
                    }}
                  >
                    {node.shortLabel}
                  </text>
                </g>
              );
            })}

            {topicNodes.map((node, i) => {
              const r = 14 + (node.weight / maxNode) * 8;
              const lit = isNodeLit(node.id);
              const isActive = activeId === node.id;
              const labelY = node.y + r + 13;

              return (
                <g
                  key={node.id}
                  className={`theme-graph-node cursor-pointer outline-none${lit ? "" : " theme-graph-node-dim"}`}
                  style={{ animationDelay: `${60 + i * 55}ms` }}
                  onMouseEnter={() => setHoveredId(node.id)}
                  onMouseLeave={() =>
                    setHoveredId((h) => (h === node.id ? null : h))
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    selectNode(node.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      selectNode(node.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectedId === node.id}
                  aria-label={`${node.label}, ${node.weight} ${node.weight === 1 ? "mention" : "mentions"}`}
                >
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={r + 16}
                    fill="transparent"
                  />
                  {isActive && (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={r + 12}
                      fill={node.color}
                      fillOpacity={0.12}
                      stroke={node.color}
                      strokeWidth={1}
                      strokeOpacity={0.4}
                    />
                  )}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={r}
                    fill={node.color}
                    fillOpacity={isActive ? 0.28 : 0.18}
                    stroke={node.color}
                    strokeWidth={isActive ? 2.25 : 1.75}
                  />
                  <text
                    x={node.x}
                    y={labelY}
                    textAnchor="middle"
                    fill="var(--ink-fg)"
                    className="font-sans pointer-events-none"
                    style={{
                      fontSize: 9,
                      fontWeight: isActive ? 600 : 500,
                      opacity: lit ? 1 : 0.45,
                    }}
                  >
                    {node.shortLabel}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <figcaption className="border-t border-ink-border/80 px-4 py-3 min-h-[3.25rem]">
        {activeNode ? (
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-ink-fg">
              {activeNode.label}
              <span className="ml-2 font-normal text-ink-muted">
                {activeNode.kind === "topic" ? "Theme" : "Moment"}
              </span>
            </p>
            <p className="text-xs text-ink-muted leading-relaxed">
              {activeNode.kind === "topic"
                ? `${activeNode.weight} ${activeNode.weight === 1 ? "mention" : "mentions"} across today’s entries`
                : `${activeNode.weight} ${activeNode.weight === 1 ? "entry" : "entries"} at this nudge`}
              {connectedEdges.length > 0 && (
                <>
                  {" "}
                  · {connectedEdges.length}{" "}
                  {connectedEdges.length === 1 ? "link" : "links"}
                  {connectedEdges.length <= 4
                    ? `: ${[...new Set(connectedEdges.map((e) => edgeKindLabel(e.kind)))].join(", ")}`
                    : ""}
                </>
              )}
            </p>
            {selectedId && (
              <button
                type="button"
                onClick={clearSelection}
                className="text-xs text-ink-accent hover:underline"
              >
                Clear selection
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-ink-muted">
            Hover or tap a node to highlight its connections.
          </p>
        )}
      </figcaption>
    </figure>
  );
}
