"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  scheduleLocalReminders,
  type NudgeFirePayload,
} from "@/lib/notifications";
import type { NudgeScheduleConfig } from "@/lib/nudges";

type Props = {
  userId: string;
  config: NudgeScheduleConfig;
  nudgesFired: string[];
  timeZone: string;
};

export function NotificationScheduler({
  userId,
  config,
  nudgesFired,
  timeZone,
}: Props) {
  const router = useRouter();

  useEffect(() => {
    return scheduleLocalReminders(userId, config, nudgesFired, timeZone, (payload: NudgeFirePayload) => {
      window.dispatchEvent(
        new CustomEvent("inkwell-nudge", { detail: payload })
      );
      router.refresh();
    });
  }, [
    userId,
    config,
    nudgesFired,
    timeZone,
    config.spontaneous,
    config.jitterMinutes,
    config.nudges,
    router,
  ]);

  return null;
}
