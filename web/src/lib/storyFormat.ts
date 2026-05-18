/** Normalize generated story prose (no em dashes, tidy spacing). */
export function sanitizeStoryProse(text: string): string {
  return text
    .replace(/\u2014/g, ", ")
    .replace(/\u2013/g, ", ")
    .replace(/\s--\s/g, ", ")
    .replace(/,\s*,+/g, ", ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
