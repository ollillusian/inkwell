"use client";

import { PeriodStoryPanel } from "@/components/PeriodStoryPanel";

type Props = {
  dateKey: string;
  initialStory: string | null;
  entryCount: number;
};

/** @deprecated Use PeriodStoryPanel — kept for existing imports. */
export function DayStoryPanel({ dateKey, initialStory, entryCount }: Props) {
  return (
    <PeriodStoryPanel
      period="day"
      periodKey={dateKey}
      initialStory={initialStory}
      entryCount={entryCount}
    />
  );
}
