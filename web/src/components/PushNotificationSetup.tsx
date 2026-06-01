"use client";

import { useEffect, useState } from "react";
import {
  registerInkwellServiceWorker,
  subscribeToPush,
  subscriptionToRow,
} from "@/lib/push/client";
import { requestNotificationPermission } from "@/lib/notifications";

type Props = {
  enabled: boolean;
};

export function PushNotificationSetup({ enabled }: Props) {
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    (async () => {
      const granted = await requestNotificationPermission();
      if (!granted) {
        if (!cancelled) setStatus("Allow notifications in your browser settings.");
        return;
      }

      await registerInkwellServiceWorker();

      const res = await fetch("/api/push/vapid-public-key");
      const { configured, publicKey } = (await res.json()) as {
        configured: boolean;
        publicKey: string | null;
      };

      if (!configured || !publicKey) {
        if (!cancelled) {
          setStatus(
            "Server push is not configured yet. Nudges work only while Inkwell is open."
          );
        }
        return;
      }

      const sub = await subscribeToPush(publicKey);
      if (!sub) {
        if (!cancelled) setStatus("Could not subscribe to push on this device.");
        return;
      }

      const row = subscriptionToRow(sub);
      if (!row) {
        if (!cancelled) setStatus("Invalid push subscription.");
        return;
      }

      const save = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row),
      });

      if (!save.ok) {
        const err = (await save.json().catch(() => ({}))) as { error?: string };
        if (!cancelled) {
          setStatus(
            err.error?.includes("push_subscriptions")
              ? "Run Supabase migration 008_push_subscriptions.sql, then reload."
              : err.error ?? "Could not save push subscription."
          );
        }
        return;
      }

      if (!cancelled) {
        setStatus(
          "Push enabled. Add Inkwell to your home screen for nudges when the app is closed (iOS 16.4+)."
        );
      }
    })().catch(() => {
      if (!cancelled) setStatus("Push setup failed.");
    });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!enabled || !status) return null;

  return (
    <p className="text-xs text-ink-muted leading-relaxed mt-2">{status}</p>
  );
}
