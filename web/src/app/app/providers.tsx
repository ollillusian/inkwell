"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NotificationScheduler } from "@/components/NotificationScheduler";
import { PushNotificationSetup } from "@/components/PushNotificationSetup";
import { scheduleConfigFromProfile } from "@/lib/notifications";
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

  const schedule = scheduleConfigFromProfile(profile ?? {});

  return (
    <>
      {profile?.notifications_enabled && (
        <>
          <PushNotificationSetup enabled />
          <NotificationScheduler
            userId={profile.id}
            config={schedule}
            nudgesFired={profile.nudges_fired ?? []}
            timeZone={profile.timezone || "UTC"}
          />
        </>
      )}
      {children}
    </>
  );
}
