import {
  buildDayThemeGraph,
  type DayThemeGraph,
  type ThemeGraphNode,
} from "@/lib/themeGraph";
import { applyThemeLayout } from "@/lib/themeGraphLayout";
import type { TopicId } from "@/lib/promptEngine";

/** Stable canvas positions for theme-graph node ids (Life map stage). */
export type ThemeLayoutRegistry = Record<string, { x: number; y: number }>;

type LayoutEntryInput = Parameters<typeof buildDayThemeGraph>[0][number];

/**
 * One force-directed pass on all entries in the timeline range.
 * Positions stay fixed while per-day graphs change weights and edges.
 */
export function buildThemeLayoutRegistry(
  entries: LayoutEntryInput[],
  profileTopics: TopicId[] = [],
  layoutSeed = 42
): ThemeLayoutRegistry {
  const graph = buildDayThemeGraph(entries, profileTopics, { layoutSeed });
  const registry: ThemeLayoutRegistry = {};
  for (const n of graph.nodes) {
    registry[n.id] = { x: n.x, y: n.y };
  }
  return registry;
}

/** Apply a layout registry to a full day graph (nodes only; edges unchanged). */
export function applyThemeLayoutToGraph(
  graph: DayThemeGraph,
  registry: ThemeLayoutRegistry
): DayThemeGraph {
  if (graph.nodes.length === 0) return graph;
  return {
    ...graph,
    nodes: applyThemeLayout(
      graph.nodes,
      graph.edges,
      registry,
      graph.width,
      graph.height
    ),
  };
}
