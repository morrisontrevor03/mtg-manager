/**
 * Fuzzy matching primitives tuned for speech-recognised Magic card names.
 *
 * Speech recognisers mangle card names in two characteristic ways:
 *  - they split compound words ("counter spell" for Counterspell), and
 *  - they substitute homophones ("shell dread" for Sheoldred).
 *
 * The scorer below handles both by comparing space-stripped and phonetically
 * folded forms of the whole name, not just bags of tokens.
 */

const COMBINING_MARKS = /[̀-ͯ]/g;

/** Lowercase, strip diacritics and punctuation, collapse whitespace. */
export function normalize(input: string): string {
  return input
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/\/\//g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fold a token to a crude phonetic key so homophones collapse together:
 * "sheoldred" and "shelldred" both reduce to the same key.
 */
export function squash(token: string): string {
  let t = token
    .replace(/^(kn|gn|pn|wr)/, "n")
    .replace(/^x/, "z")
    .replace(/ph/g, "f")
    .replace(/ck/g, "k")
    .replace(/gh/g, "")
    .replace(/wh/g, "w")
    .replace(/tion/g, "shn")
    .replace(/sion/g, "shn")
    .replace(/ough/g, "o")
    .replace(/c(?=[eiy])/g, "s")
    .replace(/c/g, "k")
    .replace(/q/g, "k")
    .replace(/x/g, "ks")
    .replace(/z/g, "s")
    .replace(/y/g, "i")
    .replace(/(.)\1+/g, "$1");
  if (!t) return "";
  // Keep the leading vowel (it carries a lot of signal) but drop the rest.
  t = t[0] + t.slice(1).replace(/[aeiou]/g, "");
  return t;
}

/** Levenshtein edit distance, two-row DP. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);

  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** 1 = identical, 0 = nothing in common. */
export function editSimilarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length, 1);
  return 1 - levenshtein(a, b) / longest;
}

/** Precomputed comparison forms for one string. Arrays, not Sets — see cardIndex. */
export interface MatchForms {
  /** Normalized, space separated. */
  normalized: string;
  /** Normalized with spaces removed. */
  joined: string;
  /** Normalized tokens. */
  tokens: string[];
  /** Phonetic key per token. */
  squashedTokens: string[];
  /** All phonetic keys concatenated. */
  squashedJoined: string;
}

export function buildForms(input: string): MatchForms {
  const normalized = normalize(input);
  const tokens = normalized ? normalized.split(" ") : [];
  const squashedTokens = tokens.map(squash);
  return {
    normalized,
    joined: normalized.replace(/ /g, ""),
    tokens,
    squashedTokens,
    squashedJoined: squashedTokens.join(""),
  };
}

function coverage(queryValues: Set<string>, candidateValues: string[]): number {
  if (queryValues.size === 0) return 0;
  let hits = 0;
  for (const v of queryValues) if (candidateValues.includes(v)) hits++;
  return hits / queryValues.size;
}

/**
 * Score how well a candidate name matches a spoken query, 0..1.
 *
 * The whole-string edit-distance terms deliberately outweigh token overlap:
 * with token overlap dominant, "counter spell" scores higher against
 * "Spell Counter" (both tokens present) than against "Counterspell".
 */
export function scoreCandidate(
  query: MatchForms,
  queryTokenSet: Set<string>,
  querySquashSet: Set<string>,
  candidate: MatchForms,
): number {
  // Short-circuits, strongest first. These carry the difficult cases.
  if (candidate.normalized === query.normalized) return 1;
  if (candidate.joined === query.joined) return 0.97; // "counter spell" -> Counterspell
  if (
    candidate.squashedJoined === query.squashedJoined &&
    query.squashedJoined.length > 0
  ) {
    return 0.93; // "lano war elves" -> Llanowar Elves
  }

  const tokenCoverage = coverage(queryTokenSet, candidate.tokens);
  const phoneticCoverage = coverage(querySquashSet, candidate.squashedTokens);
  const joinedSim = editSimilarity(query.joined, candidate.joined);
  const phoneticSim = editSimilarity(query.squashedJoined, candidate.squashedJoined);

  let score =
    0.18 * tokenCoverage + 0.12 * phoneticCoverage + 0.4 * joinedSim + 0.3 * phoneticSim;

  if (
    candidate.joined.startsWith(query.joined) ||
    query.joined.startsWith(candidate.joined)
  ) {
    score += 0.06;
  }

  // Reserve everything above this for the short-circuits.
  return Math.min(score, 0.92);
}
