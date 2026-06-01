import webpush from "web-push";
import {
  getVapidPrivateKey,
  getVapidPublicKey,
  pushConfigured,
  vapidSubject,
} from "@/lib/push/vapid";

export type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

let configured = false;

function ensureVapid() {
  if (configured) return;
  const pub = getVapidPublicKey();
  const priv = getVapidPrivateKey();
  if (!pub || !priv) {
    throw new Error("VAPID keys not configured");
  }
  webpush.setVapidDetails(vapidSubject(), pub, priv);
  configured = true;
}

export async function sendWebPush(
  sub: PushSubscriptionRow,
  payload: { title: string; body: string; url: string }
): Promise<void> {
  if (!pushConfigured()) return;
  ensureVapid();
  await webpush.sendNotification(
    {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    },
    JSON.stringify(payload)
  );
}
