export function getVapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;
}

export function getVapidPrivateKey(): string | null {
  return process.env.VAPID_PRIVATE_KEY?.trim() || null;
}

export function pushConfigured(): boolean {
  return Boolean(getVapidPublicKey() && getVapidPrivateKey());
}

export function vapidSubject(): string {
  return process.env.VAPID_SUBJECT?.trim() || "mailto:hello@inkwell.app";
}
