"use client";

import { useCallback, useEffect, useState } from "react";
import {
  registerInkwellServiceWorker,
  subscribeToPush,
  subscriptionToRow,
} from "@/lib/push/client";
import { requestNotificationPermission } from "@/lib/notifications";

type Props = {
  enabled: boolean;
};

type Phase = "idle" | "ready" | "working" | "ok" | "denied" | "error";

function isAppleDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function deniedMessage(): string {
  if (isAppleDevice()) {
    return (
      "Notifications are blocked. Open iPhone Settings → Notifications → Inkwell " +
      "(or the name you used for the home screen icon) → turn on Allow Notifications. " +
      "Then return here and tap Turn on notifications again."
    );
  }
  return "Notifications are blocked. Allow them in your browser or site settings, then tap Turn on notifications again.";
}

export function PushNotificationSetup({ enabled }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [detail, setDetail] = useState<string | null>(null);

  const runPushSetup = useCallback(async () => {
    setPhase("working");
    setDetail(null);

    const granted = await requestNotificationPermission();
    if (!granted) {
      if (typeof Notification !== "undefined" && Notification.permission === "denied") {
        setPhase("denied");
        setDetail(deniedMessage());
      } else {
        setPhase("ready");
        setDetail(
          isAppleDevice()
            ? "Tap Turn on notifications — iPhone only shows the prompt after a tap."
            : "Tap Turn on notifications to allow reminders."
        );
      }
      return;
    }

    await registerInkwellServiceWorker();

    const res = await fetch("/api/push/vapid-public-key");
    const { configured, publicKey } = (await res.json()) as {
      configured: boolean;
      publicKey: string | null;
    };

    if (!configured || !publicKey) {
      setPhase("error");
      setDetail(
        "Server push is not configured yet. Nudges work only while Inkwell is open."
      );
      return;
    }

    const sub = await subscribeToPush(publicKey);
    if (!sub) {
      setPhase("error");
      setDetail(
        isAppleDevice()
          ? "Could not subscribe. Use Share → Add to Home Screen, open from the icon, then try again."
          : "Could not subscribe to push on this device."
      );
      return;
    }

    const row = subscriptionToRow(sub);
    if (!row) {
      setPhase("error");
      setDetail("Invalid push subscription.");
      return;
    }

    const save = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row),
    });

    if (!save.ok) {
      const err = (await save.json().catch(() => ({}))) as { error?: string };
      setPhase("error");
      setDetail(
        err.error?.includes("push_subscriptions")
          ? "Run Supabase migration 008_push_subscriptions.sql, then reload."
          : err.error ?? "Could not save push subscription."
      );
      return;
    }

    setPhase("ok");
    setDetail(
      "Push enabled. On iPhone, open Inkwell from your home screen for nudges when the app is closed (iOS 16.4+)."
    );
  }, []);

  useEffect(() => {
    if (!enabled) {
      setPhase("idle");
      setDetail(null);
      return;
    }

    if (typeof window === "undefined" || !("Notification" in window)) {
      setPhase("error");
      setDetail("This browser does not support notifications.");
      return;
    }

    if (Notification.permission === "granted") {
      void runPushSetup();
      return;
    }

    if (Notification.permission === "denied") {
      setPhase("denied");
      setDetail(deniedMessage());
      return;
    }

    setPhase("ready");
    setDetail(
      isAppleDevice()
        ? "Tap the button below — iPhone will not show the permission popup until you tap."
        : "Tap the button below to allow notifications."
    );
  }, [enabled, runPushSetup]);

  if (!enabled || phase === "idle") return null;

  return (
    <div className="mt-2 space-y-2">
      {detail && (
        <p
          className={`text-xs leading-relaxed ${
            phase === "ok" ? "text-ink-fg" : "text-ink-muted"
          }`}
        >
          {detail}
        </p>
      )}
      {(phase === "ready" || phase === "denied" || phase === "error") && (
        <button
          type="button"
          onClick={() => void runPushSetup()}
          className="text-sm font-medium text-ink-accent hover:underline"
        >
          Turn on notifications
        </button>
      )}
      {phase === "working" && (
        <p className="text-xs text-ink-muted">Setting up push…</p>
      )}
    </div>
  );
}
