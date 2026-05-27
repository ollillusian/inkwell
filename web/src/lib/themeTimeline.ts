import {
  formatLocalDateLong,
  formatMonthLabel,
  formatWeekRange,
  zonedLocalToUtc,
} from "@/lib/datetime";
import { groupEntriesByLocalDay } from "@/lib/journal";
import {
  groupEntriesByLocalMonth,
  groupEntriesByLocalWeek,
} from "@/lib/journalPeriod";
import { entriesToThemeGraphInput } from "@/lib/journalGraph";
import { buildStepBeat, buildStepCaption } from "@/lib/themeNarrative";
import type { TopicId } from "@/lib/promptEngine";
import {
  buildDayThemeGraph,
  topicWeightsFromEntries,
  type DayThemeGraph,
  type ThemeGraphNode,
} from "@/lib/themeGraph";
import { buildThemeLayoutRegistry } from "@/lib/themeLayout";
import type { Entry } from "@/types/database";

export type ThemeTimelineGranularity = "day" | "week" | "month";

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
  granularity: ThemeTimelineGranularity;
  entryCount: number;
  stats: ThemeTimelineStats;
  graph: DayThemeGraph;
  change: ThemeTimelineChange | null;
  caption: string;
  beat: ReturnType<typeof buildStepBeat>;
  journalHref: string;
  /** Heaviest topic this step — used for calendar heatmap color. */
  dominantTopicId: string | null;
};

export type BuildThemeTimelineOptions = {
  granularity?: ThemeTimelineGranularity;
  maxSteps?: number;
  includeEntities?: boolean;
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

function dominantTopic(nodes: ThemeGraphNode[]): string | null {
  const topics = nodes.filter((n) => n.kind === "topic");
  if (topics.length === 0) return null;
  return topics.reduce((a, b) => (b.weight > a.weight ? b : a)).id;
}

export function compareTimelineGraphs(
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

type PeriodRow = {
  key: string;
  entries: Entry[];
  dateLabel: string;
  shortLabel: string;
  weekday: string;
  journalHref: string;
};

function maxStepsFor(granularity: ThemeTimelineGranularity): number {
  switch (granularity) {
    case "week":
      return 26;
    case "month":
      return 18;
    default:
      return 45;
  }
}

function periodRows(
  entries: Entry[],
  timeZone: string,
  granularity: ThemeTimelineGranularity,
  maxSteps: number
): PeriodRow[] {
  if (granularity === "week") {
    return groupEntriesByLocalWeek(entries, timeZone)
      .slice(0, maxSteps)
      .reverse()
      .map(({ weekStartKey, entries: periodEntries }) => ({
        key: weekStartKey,
        entries: periodEntries,
        dateLabel: formatWeekRange(weekStartKey, timeZone),
        shortLabel: formatWeekRange(weekStartKey, timeZone),
        weekday: "Week",
        journalHref: `/app/journal/week/${weekStartKey}`,
      }));
  }

  if (granularity === "month") {
    return groupEntriesByLocalMonth(entries, timeZone)
      .slice(0, maxSteps)
      .reverse()
      .map(({ monthKey, entries: periodEntries }) => ({
        key: monthKey,
        entries: periodEntries,
        dateLabel: formatMonthLabel(monthKey, timeZone),
        shortLabel: formatMonthLabel(monthKey, timeZone),
        weekday: "Month",
        journalHref: `/app/journal/month/${monthKey}`,
      }));
  }

  return groupEntriesByLocalDay(entries, timeZone)
    .slice(0, maxSteps)
    .reverse()
    .map(({ dateKey, entries: periodEntries }) => {
      const [y, mo, d] = dateKey.split("-").map(Number);
      const dayDate = zonedLocalToUtc(y, mo, d, 12, 0, timeZone);
      const labels = dayLabels(dateKey, dayDate, timeZone);
      return {
        key: dateKey,
        entries: periodEntries,
        dateLabel: labels.dateLabel,
        shortLabel: labels.shortLabel,
        weekday: labels.weekday,
        journalHref: `/app/journal/${dateKey}`,
      };
    });
}

/** Chronological steps (oldest → newest) for timeline slider. */
export function buildThemeTimeline(
  entries: Entry[],
  timeZone: string,
  resolveLabel: (slot: string) => string,
  profileTopics: TopicId[],
  options: BuildThemeTimelineOptions = {}
): ThemeTimelineStep[] {
  const granularity = options.granularity ?? "day";
  const maxSteps = options.maxSteps ?? maxStepsFor(granularity);
  const includeEntities = options.includeEntities ?? false;
  const periods = periodRows(entries, timeZone, granularity, maxSteps);

  const rangeEntries = periods.flatMap((p) => p.entries);
  const layoutRegistry =
    rangeEntries.length > 0
      ? buildThemeLayoutRegistry(
          entriesToThemeGraphInput(rangeEntries, timeZone, resolveLabel),
          profileTopics
        )
      : {};

  const steps: ThemeTimelineStep[] = [];
  let prevGraph: DayThemeGraph | null = null;
  let cumulativePriorEntries: Entry[] = [];

  for (const period of periods) {
    const priorTopicWeights =
      cumulativePriorEntries.length > 0
        ? topicWeightsFromEntries(
            cumulativePriorEntries,
            profileTopics as string[]
          )
        : undefined;

    const graph = buildDayThemeGraph(
      entriesToThemeGraphInput(period.entries, timeZone, resolveLabel),
      profileTopics,
      {
        priorTopicWeights,
        fixedPositions: layoutRegistry,
        includeEntities,
        maxEntities: 18,
      }
    );

    const change: ThemeTimelineChange | null = prevGraph
      ? { firstDay: false, ...compareTimelineGraphs(prevGraph, graph) }
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

    const draft: ThemeTimelineStep = {
      dateKey: period.key,
      dateLabel: period.dateLabel,
      shortLabel: period.shortLabel,
      weekday: period.weekday,
      granularity,
      entryCount: period.entries.length,
      stats: graphStats(graph),
      graph,
      change,
      caption: "",
      beat: "open",
      journalHref: period.journalHref,
      dominantTopicId: dominantTopic(graph.nodes),
    };

    draft.caption = buildStepCaption(draft);
    draft.beat = buildStepBeat(draft);

    steps.push(draft);

    prevGraph = graph;
    cumulativePriorEntries = [...cumulativePriorEntries, ...period.entries];
  }

  return steps;
}
