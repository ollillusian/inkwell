/** Browser helpers for Web Push subscription. */

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function registerInkwellServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (e) {
    console.warn("[inkwell] service worker registration failed:", e);
    return null;
  }
}

export async function subscribeToPush(
  vapidPublicKey: string
): Promise<PushSubscription | null> {
  const reg = await registerInkwellServiceWorker();
  if (!reg?.pushManager) return null;

  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;

  const keyBytes = urlBase64ToUint8Array(vapidPublicKey);
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: new Uint8Array(keyBytes) as BufferSource,
  });
}

export function subscriptionToRow(sub: PushSubscription): {
  endpoint: string;
  p256dh: string;
  auth: string;
} | null {
  const json = sub.toJSON();
  const keys = json.keys;
  if (!json.endpoint || !keys?.p256dh || !keys?.auth) return null;
  return {
    endpoint: json.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  };
}
