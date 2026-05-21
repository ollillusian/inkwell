import { plainSpeechSystemRules } from "@/lib/prompts/promptStyle";

export type ToneTag =
  | "dark"
  | "raw"
  | "hopeful"
  | "gentle"
  | "sharp"
  | "poetic";

export const TONE_OPTIONS: Record<
  ToneTag,
  { label: string; description: string }
> = {
  dark: {
    label: "Dark & honest",
    description: "Shadows, grief, anger, the unsaid — no forced brightness",
  },
  raw: {
    label: "Raw & unfiltered",
    description: "Messy truth, no polish, say the thing you usually swallow",
  },
  hopeful: {
    label: "Hopeful",
    description: "Light without toxic positivity — real reasons to keep going",
  },
  gentle: {
    label: "Gentle",
    description: "Soft landing, self-compassion, small steps",
  },
  sharp: {
    label: "Sharp & witty",
    description: "Irony, bite, honesty with an edge",
  },
  poetic: {
    label: "Poetic",
    description: "A simple image or rhythm is okay — still sounds like you, not a poem",
  },
};

export type WritingPreferences = {
  toneTags: ToneTag[];
  writingVoice: string;
};

export function buildVoiceBrief(prefs: WritingPreferences): string {
  const lines: string[] = [];
  if (prefs.toneTags.length > 0) {
    lines.push(
      "Tone (follow closely): " +
        prefs.toneTags.map((t) => TONE_OPTIONS[t].label).join(", ")
    );
    for (const t of prefs.toneTags) {
      lines.push(`- ${TONE_OPTIONS[t].label}: ${TONE_OPTIONS[t].description}`);
    }
  }
  if (prefs.writingVoice.trim()) {
    lines.push(`In their own words: "${prefs.writingVoice.trim()}"`);
  }
  return lines.join("\n");
}

export function systemPromptForVoice(prefs: WritingPreferences): string {
  const dark = prefs.toneTags.includes("dark");
  const raw = prefs.toneTags.includes("raw");
  const poetic = prefs.toneTags.includes("poetic");

  return plainSpeechSystemRules({
    allowPoetic: poetic,
    darkOrRaw: dark || raw,
  });
}
