"use client";

import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from "react";
import type {
  DayThemeGraph,
  ThemeGraphEdge,
  ThemeGraphNode,
} from "@/lib/themeGraph";

type Props = {
  graph: DayThemeGraph;
  /** When set, dims unrelated nodes (e.g. timeline “what’s new”). */
  emphasisIds?: string[];
  /** Extra ring on these nodes (new since prior day). */
  pulseIds?: string[];
};

/** Subtle curve so edges don't stack on identical paths. */
function edgePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bend: number
): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ox = (-dy / len) * 8 * bend;
  const oy = (dx / len) * 8 * bend;
  return `M ${x1} ${y1} Q ${mx + ox} ${my + oy} ${x2} ${y2}`;
}

function edgeMeta(edge: ThemeGraphEdge, maxWeight: number) {
  const t = edge.weight / maxWeight;
  return {
    strokeWidth: 0.65 + t * 2.1,
    bend: edge.kind === "cooccur" ? 0.9 : edge.kind === "flow" ? 1.1 : 0.35,
    dash:
      edge.kind === "flow"
        ? "5 6"
        : edge.kind === "phrase"
          ? "2 4"
          : undefined,
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
    case "phrase":
      return "Recurring phrase";
    default:
      return "Moment link";
  }
}

function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const m = svg.getScreenCTM();
  if (!m) return { x: clientX, y: clientY };
  return pt.matrixTransform(m.inverse());
}

export function ThemeNetworkGraph({
  graph,
  emphasisIds,
  pulseIds,
}: Props) {
  const uid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const { nodes, edges, width, height, centerX, centerY } = graph;

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotate, setRotate] = useState(0);
  const dragRef = useRef<{
    id: number;
    last: { x: number; y: number };
  } | null>(null);

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

  const emphasisSet = useMemo(
    () => new Set(emphasisIds ?? []),
    [emphasisIds]
  );
  const pulseSet = useMemo(() => new Set(pulseIds ?? []), [pulseIds]);

  const highlightIds = useMemo(() => {
    if (activeId) {
      const set = new Set<string>([activeId]);
      for (const id of neighbors.get(activeId) ?? []) set.add(id);
      return set;
    }
    if (emphasisSet.size === 0) return null;
    const set = new Set<string>(emphasisSet);
    for (const id of emphasisSet) {
      for (const n of neighbors.get(id) ?? []) set.add(n);
    }
    return set;
  }, [activeId, emphasisSet, neighbors]);

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

  const resetView = useCallback(() => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
    setRotate(0);
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

  const onWheel = useCallback((e: WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    setZoom((z) => Math.min(3.2, Math.max(0.35, z * factor)));
  }, []);

  const startPan = useCallback((e: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.setPointerCapture(e.pointerId);
    const p = clientToSvg(svg, e.clientX, e.clientY);
    dragRef.current = {
      id: e.pointerId,
      last: p,
    };
  }, []);

  const onSvgPointerDown = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg || e.button !== 0) return;
      const target = e.target as Element;
      if (
        target.closest(".theme-graph-node") ||
        target.closest("button")
      ) {
        return;
      }
      startPan(e);
    },
    [startPan]
  );

  const onSvgPointerMove = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      const d = dragRef.current;
      if (!svg || !d || d.id !== e.pointerId) return;
      const p = clientToSvg(svg, e.clientX, e.clientY);
      setPan((prev) => ({
        x: prev.x + (p.x - d.last.x),
        y: prev.y + (p.y - d.last.y),
      }));
      d.last = p;
    },
    []
  );

  const endPan = useCallback((e: PointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.id === e.pointerId) dragRef.current = null;
  }, []);

  const contentTransform = `translate(${pan.x} ${pan.y}) translate(${centerX} ${centerY}) rotate(${rotate}) scale(${zoom}) translate(${-centerX} ${-centerY})`;

  if (nodes.length === 0) {
    return (
      <figure className="rounded-2xl border border-ink-border bg-ink-surface/60 px-6 py-12 text-center">
        <p className="text-sm text-ink-muted">No themes to map yet for this day.</p>
      </figure>
    );
  }

  const topicNodes = nodes.filter((n) => n.kind === "topic");
  const momentNodes = nodes.filter((n) => n.kind === "moment");
  const signalNodes = nodes.filter((n) => n.kind === "signal");

  return (
    <figure className="overflow-hidden rounded-2xl border border-ink-border bg-ink-surface/90">
      <div className="px-4 pt-4 pb-2 flex flex-wrap items-start justify-between gap-3">
        <p className="text-xs text-ink-muted leading-relaxed max-w-md">
          Themes use your entry text plus onboarding labels. Phrases appear when
          the same wording shows up in multiple entries. Drag the background to
          pan; scroll to zoom; use the arrows to rotate.
        </p>
        <div className="flex flex-wrap gap-2 items-center justify-end shrink-0">
          <div className="flex gap-1">
            <button
              type="button"
              aria-label="Zoom out"
              className="rounded-lg border border-ink-border px-2 py-1 text-xs text-ink-fg hover:bg-ink-bg"
              onClick={() =>
                setZoom((z) => Math.max(0.35, z / 1.12))
              }
            >
              −
            </button>
            <button
              type="button"
              aria-label="Zoom in"
              className="rounded-lg border border-ink-border px-2 py-1 text-xs text-ink-fg hover:bg-ink-bg"
              onClick={() =>
                setZoom((z) => Math.min(3.2, z * 1.12))
              }
            >
              +
            </button>
            <button
              type="button"
              className="rounded-lg border border-ink-border px-2 py-1 text-xs text-ink-fg hover:bg-ink-bg"
              onClick={() => setRotate((r) => r - 15)}
            >
              ↺
            </button>
            <button
              type="button"
              className="rounded-lg border border-ink-border px-2 py-1 text-xs text-ink-fg hover:bg-ink-bg"
              onClick={() => setRotate((r) => r + 15)}
            >
              ↻
            </button>
            <button
              type="button"
              className="rounded-lg border border-ink-border px-2 py-1 text-xs text-ink-muted hover:bg-ink-bg"
              onClick={resetView}
            >
              Reset
            </button>
          </div>
          <div className="flex flex-wrap gap-3 text-[10px] text-ink-muted">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full border-2 border-ink-accent bg-ink-accent/25" />
              Theme
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full border border-ink-muted bg-ink-bg" />
              Moment
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm border border-dashed border-ink-fg/35 bg-ink-bg" />
              Phrase
            </span>
          </div>
        </div>
      </div>

      <div
        className="relative touch-pan-y cursor-grab active:cursor-grabbing"
        onMouseLeave={() => setHoveredId(null)}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto block theme-graph-svg select-none touch-manipulation [touch-action:none]"
          role="img"
          aria-label="Interactive map of journal themes and phrases"
          onWheel={onWheel}
          onPointerDown={onSvgPointerDown}
          onPointerMove={onSvgPointerMove}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          onClick={(e) => {
            if (e.target === e.currentTarget) clearSelection();
          }}
        >
          <defs>
            <radialGradient id={`${uid}-wash`} cx="50%" cy="48%" r="62%">
              <stop offset="0%" stopColor="var(--ink-surface)" stopOpacity="0.85" />
              <stop offset="100%" stopColor="var(--ink-bg)" stopOpacity="0.15" />
            </radialGradient>
          </defs>

          <rect
            width={width}
            height={height}
            fill={`url(#${uid}-wash)`}
            className="pointer-events-none"
          />

          <g transform={contentTransform}>
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
                    d={edgePath(a.x, a.y, b.x, b.y, meta.bend)}
                    fill="none"
                    stroke={
                      lit && activeId
                        ? "var(--ink-accent)"
                        : "var(--ink-border)"
                    }
                    strokeWidth={
                      lit ? meta.strokeWidth : meta.strokeWidth * 0.65
                    }
                    strokeOpacity={
                      lit
                        ? 0.2 + t * 0.42
                        : highlightIds
                          ? 0.06
                          : 0.14 + t * 0.26
                    }
                    strokeDasharray={meta.dash}
                    strokeLinecap="round"
                    className="theme-graph-edge transition-[stroke,stroke-opacity,stroke-width] duration-200"
                    style={{ animationDelay: `${i * 30}ms` }}
                  />
                );
              })}
            </g>

            <g className="theme-graph-nodes">
              {signalNodes.map((node, i) => {
                const s = 4 + (node.weight / maxNode) * 3;
                const lit = isNodeLit(node.id);
                const isActive = activeId === node.id;
                const isPulse = pulseSet.has(node.id);
                const labelY = node.y + s + 12;
                return (
                  <g
                    key={node.id}
                    className={`theme-graph-node cursor-pointer outline-none${lit ? "" : " theme-graph-node-dim"}`}
                    style={{ animationDelay: `${40 + i * 40}ms` }}
                    onMouseEnter={() => setHoveredId(node.id)}
                    onMouseLeave={() =>
                      setHoveredId((h) => (h === node.id ? null : h))
                    }
                    onClick={(ev) => {
                      ev.stopPropagation();
                      selectNode(node.id);
                    }}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        selectNode(node.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selectedId === node.id}
                    aria-label={`Phrase: ${node.label}`}
                  >
                    <rect
                      x={node.x - s - 12}
                      y={node.y - s - 12}
                      width={(s + 12) * 2}
                      height={(s + 12) * 2}
                      fill="transparent"
                    />
                    {isPulse && (
                      <rect
                        x={node.x - s - 4}
                        y={node.y - s - 4}
                        width={(s + 4) * 2}
                        height={(s + 4) * 2}
                        rx={3}
                        fill="none"
                        stroke="var(--ink-accent)"
                        strokeWidth={1}
                        className="theme-graph-pulse"
                      />
                    )}
                    <rect
                      x={node.x - s}
                      y={node.y - s}
                      width={s * 2}
                      height={s * 2}
                      rx={2}
                      fill="var(--ink-bg)"
                      stroke={isActive ? "var(--ink-accent)" : node.color}
                      strokeWidth={isActive ? 1.5 : 1}
                      strokeDasharray="3 2"
                    />
                    <text
                      x={node.x}
                      y={labelY}
                      textAnchor="middle"
                      fill="var(--ink-muted)"
                      className="font-sans pointer-events-none"
                      style={{
                        fontSize: 8,
                        opacity: lit ? 1 : 0.45,
                      }}
                    >
                      {node.shortLabel}
                    </text>
                  </g>
                );
              })}

              {momentNodes.map((node, i) => {
                const r = 5 + (node.weight / maxNode) * 3;
                const lit = isNodeLit(node.id);
                const isActive = activeId === node.id;
                const isPulse = pulseSet.has(node.id);
                const labelY = node.y + r + 11;
                return (
                  <g
                    key={node.id}
                    className={`theme-graph-node cursor-pointer outline-none${lit ? "" : " theme-graph-node-dim"}`}
                    style={{ animationDelay: `${80 + i * 45}ms` }}
                    onMouseEnter={() => setHoveredId(node.id)}
                    onMouseLeave={() =>
                      setHoveredId((h) => (h === node.id ? null : h))
                    }
                    onClick={(ev) => {
                      ev.stopPropagation();
                      selectNode(node.id);
                    }}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
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
                    {isPulse && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={r + 8}
                        fill="none"
                        stroke="var(--ink-accent)"
                        strokeWidth={1}
                        className="theme-graph-pulse"
                      />
                    )}
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
                const r = 12 + (node.weight / maxNode) * 9;
                const lit = isNodeLit(node.id);
                const isActive = activeId === node.id;
                const isPulse = pulseSet.has(node.id);
                const labelY = node.y + r + 13;
                return (
                  <g
                    key={node.id}
                    className={`theme-graph-node cursor-pointer outline-none${lit ? "" : " theme-graph-node-dim"}`}
                    style={{ animationDelay: `${60 + i * 50}ms` }}
                    onMouseEnter={() => setHoveredId(node.id)}
                    onMouseLeave={() =>
                      setHoveredId((h) => (h === node.id ? null : h))
                    }
                    onClick={(ev) => {
                      ev.stopPropagation();
                      selectNode(node.id);
                    }}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
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
                    {isPulse && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={r + 10}
                        fill="none"
                        stroke="var(--ink-accent)"
                        strokeWidth={1.25}
                        className="theme-graph-pulse"
                      />
                    )}
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
          </g>
        </svg>
      </div>

      <figcaption className="border-t border-ink-border/80 px-4 py-3 min-h-[3.25rem]">
        {activeNode ? (
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-ink-fg">
              {activeNode.label}
              <span className="ml-2 font-normal text-ink-muted">
                {activeNode.kind === "topic"
                  ? "Theme"
                  : activeNode.kind === "moment"
                    ? "Moment"
                    : "Phrase"}
              </span>
            </p>
            <p className="text-xs text-ink-muted leading-relaxed">
              {activeNode.kind === "topic"
                ? `${activeNode.weight} ${activeNode.weight === 1 ? "mention" : "mentions"} in this span`
                : activeNode.kind === "moment"
                  ? `${activeNode.weight} ${activeNode.weight === 1 ? "entry" : "entries"} here`
                  : `Appears in ${activeNode.weight} ${activeNode.weight === 1 ? "entry" : "entries"}`}
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
            Drag the canvas to pan. Scroll to zoom. Tap a node to highlight its
            links.
          </p>
        )}
      </figcaption>
    </figure>
  );
}
