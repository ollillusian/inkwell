/** Common IANA timezones for the settings picker. */
export const COMMON_TIMEZONES: { value: string; label: string }[] = [
  { value: "Pacific/Honolulu", label: "Honolulu (HST)" },
  { value: "America/Anchorage", label: "Anchorage (AKST)" },
  { value: "America/Los_Angeles", label: "Los Angeles (PT)" },
  { value: "America/Denver", label: "Denver (MT)" },
  { value: "America/Chicago", label: "Chicago (CT)" },
  { value: "America/New_York", label: "New York (ET)" },
  { value: "America/Toronto", label: "Toronto (ET)" },
  { value: "America/Sao_Paulo", label: "São Paulo" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Paris", label: "Paris (CET)" },
  { value: "Europe/Berlin", label: "Berlin (CET)" },
  { value: "Europe/Istanbul", label: "Istanbul" },
  { value: "Asia/Dubai", label: "Dubai" },
  { value: "Asia/Karachi", label: "Karachi" },
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Australia/Sydney", label: "Sydney" },
  { value: "Pacific/Auckland", label: "Auckland" },
  { value: "UTC", label: "UTC" },
];

export function detectDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function timezoneLabel(tz: string): string {
  const found = COMMON_TIMEZONES.find((z) => z.value === tz);
  if (found) return found.label;
  try {
    const now = new Date();
    const short = new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      timeZoneName: "short",
    })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value;
    return short ? `${tz.replace(/_/g, " ")} (${short})` : tz.replace(/_/g, " ");
  } catch {
    return tz;
  }
}
