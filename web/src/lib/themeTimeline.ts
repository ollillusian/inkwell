import { formatLocalDateLong, zonedLocalToUtc } from "@/lib/datetime";
import { groupEntriesByLocalDay } from "@/lib/journal";
import { entriesToThemeGraphInput } from "@/lib/journalGraph";
import type { TopicId } from "@/lib/promptEngine";
import {
  buildDayThemeGraph,
  type DayThemeGraph,
  type ThemeGraphNode,
} from "@/lib/themeGraph";
import type { Entry } from "@/types/database";

export type ThemeTimelineStats = {
  topics: number;
  moments: number;
  phrases: number;
  links: number;
};

export type ThemeTimelineChange = {
  firstDay: boolean;
  newTopics: string[];
  newTopicIds: string[];
  topicsAgain: string[];
  carriedTopicIds: string[];
  newPhrases: string[];
  newPhraseIds: string[];
  newMoments: string[];
  newMomentIds: string[];
  strongerTopics: string[];
  strongerTopicIds: string[];
};

export type ThemeTimelineStep = {
  dateKey: string;
  dateLabel: string;
  shortLabel: string;
  weekday: string;
  entryCount: number;
  stats: ThemeTimelineStats;
  graph: DayThemeGraph;
  change: ThemeTimelineChange | null;
};

export function timelineEmphasisIds(step: ThemeTimelineStep): string[] {
  const c = step.change;
  if (!c || c.firstDay) return [];
  return [
    ...c.newTopicIds,
    ...c.newPhraseIds,
    ...c.newMomentIds,
    ...c.strongerTopicIds,
  ];
}

function graphStats(graph: DayThemeGraph): ThemeTimelineStats {
  return {
    topics: graph.nodes.filter((n) => n.kind === "topic").length,
    moments: graph.nodes.filter((n) => n.kind === "moment").length,
    phrases: graph.nodes.filter((n) => n.kind === "signal").length,
    links: graph.edges.length,
  };
}

function nodeLabels(nodes: ThemeGraphNode[], kind: ThemeGraphNode["kind"]) {
  return nodes.filter((n) => n.kind === kind).map((n) => n.label);
}

function topicIds(nodes: ThemeGraphNode[]): string[] {
  return nodes.filter((n) => n.kind === "topic").map((n) => n.id);
}

function compareDays(
  prev: DayThemeGraph,
  curr: DayThemeGraph
): Omit<ThemeTimelineChange, "firstDay"> {
  const prevTopics = new Set(topicIds(prev.nodes));
  const currTopics = new Set(topicIds(curr.nodes));
  const prevPhrases = new Set(
    prev.nodes.filter((n) => n.kind === "signal").map((n) => n.label)
  );
  const prevMoments = new Set(
    prev.nodes.filter((n) => n.kind === "moment").map((n) => n.label)
  );

  const newTopics = [...currTopics].filter((id) => !prevTopics.has(id));
  const topicsAgain = [...currTopics].filter((id) => prevTopics.has(id));

  const currTopicNodes = curr.nodes.filter((n) => n.kind === "topic");
  const prevWeight = new Map(
    prev.nodes
      .filter((n) => n.kind === "topic")
      .map((n) => [n.id, n.weight] as const)
  );
  const strongerTopics = currTopicNodes
    .filter((n) => (prevWeight.get(n.id) ?? 0) < n.weight)
    .map((n) => n.label);

  const newPhrases = nodeLabels(curr.nodes, "signal").filter(
    (l) => !prevPhrases.has(l)
  );
  const newMoments = nodeLabels(curr.nodes, "moment").filter(
    (l) => !prevMoments.has(l)
  );

  return {
    newTopics: newTopics.map(
      (id) => curr.nodes.find((n) => n.id === id)?.label ?? id
    ),
    newTopicIds: newTopics,
    topicsAgain: topicsAgain.map(
      (id) => curr.nodes.find((n) => n.id === id)?.label ?? id
    ),
    carriedTopicIds: topicsAgain,
    newPhrases,
    newPhraseIds: curr.nodes
      .filter((n) => n.kind === "signal" && !prevPhrases.has(n.label))
      .map((n) => n.id),
    newMoments,
    newMomentIds: curr.nodes
      .filter((n) => n.kind === "moment" && !prevMoments.has(n.label))
      .map((n) => n.id),
    strongerTopics,
    strongerTopicIds: currTopicNodes
      .filter((n) => (prevWeight.get(n.id) ?? 0) < n.weight)
      .map((n) => n.id),
  };
}

function dayLabels(
  dateKey: string,
  dayDate: Date,
  timeZone: string
): { dateLabel: string; shortLabel: string; weekday: string } {
  const dateLabel = formatLocalDateLong(dayDate, timeZone);
  const shortFmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const weekdayFmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
  });
  return {
    dateLabel,
    shortLabel: shortFmt.format(dayDate),
    weekday: weekdayFmt.format(dayDate),
  };
}

/** Chronological steps (oldest → newest) for timeline slider. */
export function buildThemeTimeline(
  entries: Entry[],
  timeZone: string,
  resolveLabel: (slot: string) => string,
  profileTopics: TopicId[],
  maxDays = 45
): ThemeTimelineStep[] {
  const days = groupEntriesByLocalDay(entries, timeZone)
    .slice(0, maxDays)
    .reverse();

  const steps: ThemeTimelineStep[] = [];
  let prevGraph: DayThemeGraph | null = null;

  for (const { dateKey, entries: dayEntries } of days) {
    const [y, mo, d] = dateKey.split("-").map(Number);
    const dayDate = zonedLocalToUtc(y, mo, d, 12, 0, timeZone);
    const graph = buildDayThemeGraph(
      entriesToThemeGraphInput(dayEntries, timeZone, resolveLabel),
      profileTopics,
      { layoutSeed: dateKey.split("").reduce((a, c) => a + c.charCodeAt(0), 0) }
    );

    const change: ThemeTimelineChange | null = prevGraph
      ? { firstDay: false, ...compareDays(prevGraph, graph) }
      : {
          firstDay: true,
          newTopics: [],
          newTopicIds: [],
          topicsAgain: [],
          carriedTopicIds: [],
          newPhrases: [],
          newPhraseIds: [],
          newMoments: [],
          newMomentIds: [],
          strongerTopics: [],
          strongerTopicIds: [],
        };

    if (change.firstDay) {
      change.newTopics = nodeLabels(graph.nodes, "topic");
      change.newTopicIds = topicIds(graph.nodes);
      change.newPhrases = nodeLabels(graph.nodes, "signal");
      change.newPhraseIds = graph.nodes
        .filter((n) => n.kind === "signal")
        .map((n) => n.id);
      change.newMoments = nodeLabels(graph.nodes, "moment");
      change.newMomentIds = graph.nodes
        .filter((n) => n.kind === "moment")
        .map((n) => n.id);
    }

    const labels = dayLabels(dateKey, dayDate, timeZone);

    steps.push({
      dateKey,
      dateLabel: labels.dateLabel,
      shortLabel: labels.shortLabel,
      weekday: labels.weekday,
      entryCount: dayEntries.length,
      stats: graphStats(graph),
      graph,
      change,
    });

    prevGraph = graph;
  }

  return steps;
}
