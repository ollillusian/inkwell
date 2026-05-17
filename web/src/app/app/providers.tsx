"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NotificationScheduler } from "@/components/NotificationScheduler";
import { legacyScheduleFromProfile } from "@/lib/nudges";
import type { Profile } from "@/types/database";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data) setProfile(data as Profile);
        });
    });
  }, []);

  const schedule = legacyScheduleFromProfile(profile ?? {});

  return (
    <>
      {profile?.notifications_enabled && (
        <NotificationScheduler
          userId={profile.id}
          config={schedule}
          nudgesFired={profile.nudges_fired ?? []}
          timeZone={profile.timezone || "UTC"}
        />
      )}
      {children}
    </>
  );
}
