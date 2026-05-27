"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from "react";
import type {
  DayThemeGraph,
  GraphContext,
  ThemeGraphEdge,
  ThemeGraphNode,
} from "@/lib/themeGraph";

type Props = {
  graph: DayThemeGraph;
  /** When set, dims unrelated nodes (e.g. timeline “what’s new”). */
  emphasisIds?: string[];
  /** Extra ring on these nodes (new since prior day). */
  pulseIds?: string[];
  /** Tighter chrome for timeline / narrow layouts. */
  compact?: boolean;
  /** Fired when the user selects or clears a node (timeline focus rail). */
  onSelectedNodeChange?: (nodeId: string | null) => void;
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

function NodeDetailPanel({
  node,
  connectedEdges,
  context,
  nodes,
  onClear,
}: {
  node: ThemeGraphNode | null;
  connectedEdges: ThemeGraphEdge[];
  context?: GraphContext;
  nodes: ThemeGraphNode[];
  onClear?: () => void;
}) {
  if (!node) {
    return (
      <figcaption className="border-t border-ink-border/80 px-3 sm:px-4 py-3 min-h-[3.25rem]">
        <p className="text-xs text-ink-muted">
          Tap a node to see what it means in your writing.
        </p>
      </figcaption>
    );
  }

  const excerpts = context?.excerpts[node.id] ?? [];
  const bond = node.kind === "topic" ? context?.strongestBond[node.id] : undefined;
  const trend = node.kind === "topic" ? context?.trends[node.id] : undefined;

  const edgeExplanations: string[] = [];
  if (context?.edgeExplanations) {
    for (const edge of connectedEdges.slice(0, 4)) {
      const key = [edge.source, edge.target].sort().join("|");
      const exp = context.edgeExplanations[key];
      if (exp) edgeExplanations.push(exp);
    }
  }

  const kindLabel =
    node.kind === "topic" ? "Theme" : node.kind === "moment" ? "Moment" : "Phrase";

  const weightLabel =
    node.kind === "topic"
      ? `${node.weight} ${node.weight === 1 ? "mention" : "mentions"}`
      : node.kind === "moment"
        ? `${node.weight} ${node.weight === 1 ? "entry" : "entries"}`
        : `In ${node.weight} ${node.weight === 1 ? "entry" : "entries"}`;

  const trendLabel =
    trend === "new"
      ? "New this period"
      : trend === "growing"
        ? "Showing up more"
        : trend === "fading"
          ? "Fading lately"
          : null;

  return (
    <figcaption className="border-t border-ink-border/80 px-3 sm:px-4 py-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-ink-fg">
            {node.label}
            <span className="ml-2 font-normal text-ink-muted">{kindLabel}</span>
            {trendLabel && (
              <span className="ml-2 text-xs text-ink-accent">{trendLabel}</span>
            )}
          </p>
          <p className="text-xs text-ink-muted mt-0.5">
            {weightLabel} · {connectedEdges.length}{" "}
            {connectedEdges.length === 1 ? "connection" : "connections"}
          </p>
        </div>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-ink-accent hover:underline shrink-0"
          >
            Clear
          </button>
        )}
      </div>

      {bond && (
        <p className="text-xs text-ink-muted leading-relaxed">
          <span className="text-ink-fg font-medium">Strongest bond:</span>{" "}
          {node.label} and {bond.peerLabel} appeared together in{" "}
          {bond.count} {bond.count === 1 ? "entry" : "entries"}.
        </p>
      )}

      {edgeExplanations.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">
            Connections
          </p>
          <ul className="space-y-0.5">
            {edgeExplanations.map((exp, i) => (
              <li key={i} className="text-xs text-ink-muted leading-relaxed">
                {exp}
              </li>
            ))}
          </ul>
        </div>
      )}

      {excerpts.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">
            From your entries
          </p>
          {excerpts.map((ex, i) => (
            <div
              key={i}
              className="rounded-xl border border-ink-border/60 bg-ink-bg/50 px-3 py-2"
            >
              <p className="text-xs text-ink-fg leading-relaxed italic">
                &ldquo;{ex.text}&rdquo;
              </p>
              <p className="text-[10px] text-ink-muted mt-1">{ex.momentLabel}</p>
            </div>
          ))}
        </div>
      )}
    </figcaption>
  );
}

export function ThemeNetworkGraph({
  graph,
  emphasisIds,
  pulseIds,
  compact = false,
  onSelectedNodeChange,
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

  const nodeIdSet = useMemo(() => nodes.map((n) => n.id).join(","), [nodes]);
  useEffect(() => {
    if (selectedId && !nodeById.has(selectedId)) {
      setSelectedId(null);
      onSelectedNodeChange?.(null);
    }
  }, [nodeIdSet, selectedId, nodeById, onSelectedNodeChange]);

  /* ---- Smooth position interpolation (timeline day transitions) ---- */
  const animPosRef = useRef(
    new Map<string, { x: number; y: number; opacity: number }>()
  );
  const [animPos, setAnimPos] = useState<
    Map<string, { x: number; y: number; opacity: number }>
  >(() => {
    const m = new Map<string, { x: number; y: number; opacity: number }>();
    for (const n of nodes) m.set(n.id, { x: n.x, y: n.y, opacity: 1 });
    return m;
  });
  const rafRef = useRef(0);

  useEffect(() => {
    const prev = animPosRef.current;
    const isInit = prev.size === 0;
    type AP = { x: number; y: number; opacity: number };
    const targets = new Map<string, AP>();
    const starts = new Map<string, AP>();

    for (const n of nodes) {
      targets.set(n.id, { x: n.x, y: n.y, opacity: 1 });
      if (isInit) {
        starts.set(n.id, { x: n.x, y: n.y, opacity: 1 });
      } else {
        const p = prev.get(n.id);
        starts.set(n.id, p ?? { x: n.x, y: n.y, opacity: 0 });
      }
    }

    if (isInit) {
      animPosRef.current = new Map(targets);
      setAnimPos(new Map(targets));
      return;
    }

    const dur = 420;
    let t0: number | null = null;
    const tick = (ts: number) => {
      if (!t0) t0 = ts;
      const t = Math.min((ts - t0) / dur, 1);
      const ease = 1 - (1 - t) ** 3;
      const cur = new Map<string, AP>();
      for (const n of nodes) {
        const s = starts.get(n.id)!;
        const g = targets.get(n.id)!;
        cur.set(n.id, {
          x: s.x + (g.x - s.x) * ease,
          y: s.y + (g.y - s.y) * ease,
          opacity: s.opacity + (g.opacity - s.opacity) * ease,
        });
      }
      animPosRef.current = cur;
      setAnimPos(cur);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [nodes]);

  const displayNodes = useMemo(
    () =>
      nodes.map((n) => {
        const a = animPos.get(n.id);
        return a ? { ...n, x: a.x, y: a.y } : n;
      }),
    [nodes, animPos]
  );

  const nodeOpacity = useCallback(
    (id: string) => animPos.get(id)?.opacity ?? 0,
    [animPos]
  );
  /* ---- end animation ---- */

  const activeId = selectedId ?? hoveredId;

  const pos = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const n of nodes) {
      const a = animPos.get(n.id);
      m.set(n.id, a ? { x: a.x, y: a.y } : { x: n.x, y: n.y });
    }
    return m;
  }, [nodes, animPos]);

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

  const selectNode = useCallback(
    (id: string) => {
      setSelectedId((prev) => {
        const next = prev === id ? null : id;
        onSelectedNodeChange?.(next);
        return next;
      });
    },
    [onSelectedNodeChange]
  );

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    onSelectedNodeChange?.(null);
  }, [onSelectedNodeChange]);

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

  const topicNodes = displayNodes.filter((n) => n.kind === "topic");
  const momentNodes = displayNodes.filter((n) => n.kind === "moment");
  const signalNodes = displayNodes.filter((n) => n.kind === "signal");

  return (
    <figure className="w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-ink-border bg-ink-surface/90">
      <div
        className={`px-3 sm:px-4 pt-3 sm:pt-4 pb-2 flex gap-2 ${
          compact
            ? "flex-col"
            : "flex-wrap items-start justify-between gap-3"
        }`}
      >
        {!compact && (
          <p className="text-xs text-ink-muted leading-relaxed max-w-md min-w-0">
            Themes use your entry text plus onboarding labels. Phrases appear when
            the same wording shows up in multiple entries. Drag the background to
            pan; scroll to zoom; use the arrows to rotate.
          </p>
        )}
        <div
          className={`flex flex-wrap gap-2 items-center ${
            compact ? "w-full justify-between" : "justify-end shrink-0"
          }`}
        >
          {compact && (
            <p className="text-[10px] text-ink-muted">Pan · scroll zoom · rotate</p>
          )}
          <div className="flex gap-1 shrink-0">
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
          <div className="flex flex-wrap gap-2 sm:gap-3 text-[10px] text-ink-muted shrink-0">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full border-2 border-ink-accent bg-ink-accent/25" />
              Theme
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full border border-ink-muted bg-ink-bg" />
              Moment
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm border border-dashed border-ink-fg/35 bg-ink-bg" />
              Phrase
            </span>
          </div>
        </div>
      </div>

      <div
        className="relative w-full max-w-full min-w-0 touch-pan-y cursor-grab active:cursor-grabbing"
        onMouseLeave={() => setHoveredId(null)}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full max-w-full h-auto block theme-graph-svg select-none touch-manipulation [touch-action:none]"
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
                    className="theme-graph-edge"
                    style={{ animationDelay: `${i * 30}ms` }}
                  />
                );
              })}
            </g>

            <g className="theme-graph-nodes">
              {signalNodes.map((node) => {
                const s = 4 + (node.weight / maxNode) * 3;
                const lit = isNodeLit(node.id);
                const isActive = activeId === node.id;
                const isPulse = pulseSet.has(node.id);
                const labelY = node.y + s + 12;
                return (
                  <g
                    key={node.id}
                    className={`theme-graph-node cursor-pointer outline-none${lit ? "" : " theme-graph-node-dim"}`}
                    style={{ opacity: nodeOpacity(node.id) }}
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

              {momentNodes.map((node) => {
                const r = 5 + (node.weight / maxNode) * 3;
                const lit = isNodeLit(node.id);
                const isActive = activeId === node.id;
                const isPulse = pulseSet.has(node.id);
                const labelY = node.y + r + 11;
                return (
                  <g
                    key={node.id}
                    className={`theme-graph-node cursor-pointer outline-none${lit ? "" : " theme-graph-node-dim"}`}
                    style={{ opacity: nodeOpacity(node.id) }}
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
                    <circle cx={node.x} cy={node.y} r={r + 14} fill="transparent" />
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
                      stroke={isActive ? "var(--ink-accent)" : "var(--ink-muted)"}
                      strokeWidth={isActive ? 1.75 : 1.25}
                    />
                    <text
                      x={node.x}
                      y={labelY}
                      textAnchor="middle"
                      fill="var(--ink-muted)"
                      className="font-sans pointer-events-none"
                      style={{ fontSize: 8.5, opacity: lit ? 1 : 0.5 }}
                    >
                      {node.shortLabel}
                    </text>
                  </g>
                );
              })}

              {topicNodes.map((node) => {
                const r = 12 + (node.weight / maxNode) * 9;
                const lit = isNodeLit(node.id);
                const isActive = activeId === node.id;
                const isPulse = pulseSet.has(node.id);
                const labelY = node.y + r + 13;
                const trend = graph.context?.trends[node.id];
                return (
                  <g
                    key={node.id}
                    className={`theme-graph-node cursor-pointer outline-none${lit ? "" : " theme-graph-node-dim"}`}
                    style={{ opacity: nodeOpacity(node.id) }}
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
                    aria-label={`${node.label}, ${node.weight} ${node.weight === 1 ? "mention" : "mentions"}${trend ? `, ${trend}` : ""}`}
                  >
                    <circle cx={node.x} cy={node.y} r={r + 16} fill="transparent" />
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
                    {trend && trend !== "steady" && lit && (
                      <g className="pointer-events-none">
                        <circle
                          cx={node.x + r * 0.7}
                          cy={node.y - r * 0.7}
                          r={5.5}
                          fill="var(--ink-bg)"
                          stroke={
                            trend === "new"
                              ? "var(--ink-accent)"
                              : trend === "growing"
                                ? "#6d8a72"
                                : "#a07d5c"
                          }
                          strokeWidth={1}
                        />
                        <text
                          x={node.x + r * 0.7}
                          y={node.y - r * 0.7 + 0.5}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill={
                            trend === "new"
                              ? "var(--ink-accent)"
                              : trend === "growing"
                                ? "#6d8a72"
                                : "#a07d5c"
                          }
                          style={{ fontSize: 7, fontWeight: 700 }}
                        >
                          {trend === "new" ? "N" : trend === "growing" ? "\u2191" : "\u2193"}
                        </text>
                      </g>
                    )}
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

      <NodeDetailPanel
        node={activeNode}
        connectedEdges={connectedEdges}
        context={graph.context}
        nodes={nodes}
        onClear={selectedId ? clearSelection : undefined}
      />
    </figure>
  );
}
