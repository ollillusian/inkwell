import { TOPICS, isValidTopicId, type TopicId } from "@/lib/promptEngine";

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "are",
  "but",
  "not",
  "you",
  "all",
  "can",
  "her",
  "was",
  "one",
  "our",
  "out",
  "has",
  "have",
  "been",
  "were",
  "said",
  "each",
  "which",
  "their",
  "time",
  "will",
  "with",
  "that",
  "this",
  "from",
  "your",
  "what",
  "when",
  "where",
  "who",
  "how",
  "why",
  "just",
  "like",
  "into",
  "about",
  "than",
  "then",
  "them",
  "some",
  "would",
  "could",
  "should",
  "very",
  "more",
  "also",
  "back",
  "only",
  "even",
  "much",
  "really",
  "dont",
  "didnt",
  "doesnt",
  "im",
  "ive",
  "ill",
  "its",
  "isnt",
  "wasnt",
  "werent",
  "got",
  "get",
  "day",
  "today",
  "now",
  "here",
  "there",
  "thing",
  "things",
  "feel",
  "feeling",
  "felt",
  "want",
  "need",
  "know",
  "think",
  "still",
  "something",
  "nothing",
  "everything",
]);

function normalizeToken(raw: string): string | null {
  const t = raw
    .toLowerCase()
    .replace(/[^a-z0-9']/g, "")
    .replace(/^'+|'+$/g, "");
  if (t.length < 3) return null;
  if (STOPWORDS.has(t)) return null;
  return t;
}

export function tokenizeBody(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/\s+/)) {
    const t = normalizeToken(raw);
    if (t) out.push(t);
  }
  return out;
}

/** Topic lexicon from onboarding copy (label + description). */
function topicLexicon(): Map<TopicId, Set<string>> {
  const map = new Map<TopicId, Set<string>>();
  for (const id of Object.keys(TOPICS) as TopicId[]) {
    const meta = TOPICS[id];
    const bag = new Set<string>();
    for (const part of [meta.label, meta.description]) {
      for (const raw of part.toLowerCase().split(/\s+/)) {
        const t = normalizeToken(raw.replace(/—/g, " "));
        if (t) bag.add(t);
      }
    }
    map.set(id, bag);
  }
  return map;
}

const LEX = topicLexicon();

/** Document frequency: how many entries contain token t. */
function documentFrequency(tokenSets: string[][]): Map<string, number> {
  const df = new Map<string, number>();
  for (const tokens of tokenSets) {
    const seen = new Set(tokens);
    for (const t of seen) {
      df.set(t, (df.get(t) ?? 0) + 1);
    }
  }
  return df;
}

export type EntryForAnalysis = {
  id: string;
  topics_snapshot: string[];
  body: string;
};

/**
 * Score each TopicId against entry text (TF-IDF-style overlap with topic lexicon).
 * Merges explicit snapshot topics with text-supported themes.
 */
export function analyzedTopicsForEntry(
  entry: EntryForAnalysis,
  profileTopics: TopicId[],
  tokenSets: string[][],
  df: Map<string, number>,
  nDocs: number
): TopicId[] {
  const tokens = tokenizeBody(entry.body);
  const fromSnapshot = entry.topics_snapshot.filter((t): t is TopicId =>
    isValidTopicId(t)
  );

  if (tokens.length === 0) {
    if (fromSnapshot.length > 0) return [...new Set(fromSnapshot)];
    if (profileTopics.length > 0) return [...new Set(profileTopics.slice(0, 2))];
    return ["free"];
  }

  const scores = new Map<TopicId, number>();
  for (const tid of Object.keys(TOPICS) as TopicId[]) {
    const lex = LEX.get(tid)!;
    let s = 0;
    const seenTerm = new Set<string>();
    for (const t of tokens) {
      if (!lex.has(t) || seenTerm.has(t)) continue;
      seenTerm.add(t);
      const idf = Math.log(1 + nDocs / (df.get(t) ?? 1));
      s += idf;
    }
    scores.set(tid, s);
  }

  const maxScore = Math.max(...scores.values(), 1e-6);
  const threshold = Math.max(0.22 * maxScore, 0.35);
  const fromText = (Object.keys(TOPICS) as TopicId[]).filter(
    (tid) => (scores.get(tid) ?? 0) >= threshold
  );

  const merged: TopicId[] = [];
  const add = (t: TopicId) => {
    if (!merged.includes(t)) merged.push(t);
  };
  for (const t of fromSnapshot) add(t);
  for (const t of fromText) add(t);
  if (merged.length === 0) add("free");

  return merged.slice(0, 5);
}

/** Recurring salient bigrams across entries (open-ended signals). */
export function salientPhrasesAcrossEntries(
  entries: EntryForAnalysis[],
  minEntries = 2,
  maxPhrases = 8
): { id: string; label: string; entryIds: Set<string> }[] {
  const phraseToEntries = new Map<string, Set<string>>();

  for (const e of entries) {
    const tokens = tokenizeBody(e.body);
    const seen = new Set<string>();
    for (let i = 0; i < tokens.length - 1; i++) {
      const a = tokens[i]!;
      const b = tokens[i + 1]!;
      const key = `${a}_${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!phraseToEntries.has(key)) phraseToEntries.set(key, new Set());
      phraseToEntries.get(key)!.add(e.id);
    }
  }

  const list = [...phraseToEntries.entries()]
    .filter(([, ids]) => ids.size >= minEntries)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, maxPhrases)
    .map(([key, entryIds]) => ({
      id: `phrase:${key}`,
      label: key.replace(/_/g, " "),
      entryIds,
    }));

  return list;
}

export function prepareCorpusForAnalysis(entries: EntryForAnalysis[]): {
  tokenSets: string[][];
  df: Map<string, number>;
  nDocs: number;
} {
  const tokenSets = entries.map((e) => tokenizeBody(e.body));
  const nDocs = Math.max(entries.length, 1);
  return { tokenSets, df: documentFrequency(tokenSets), nDocs };
}
