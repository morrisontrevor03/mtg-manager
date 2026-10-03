import { db } from "@/lib/db";
import { fetchCardNameCatalog } from "@/lib/scryfall";
import { buildForms, scoreCandidate, type MatchForms } from "@/lib/textMatch";

const CACHE_KEY = "card-names";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // a week

/**
 * Confidence thresholds, set from a measured run of the scorer over the full
 * catalogue: realistic voice manglings scored 0.71-1.00, junk utterances
 * 0.31-0.42. The gap between them is where these sit.
 */
export const AUTO_ACCEPT = 0.9;
export const CONFIRM_FLOOR = 0.62;

export type MatchDecision = "auto" | "confirm" | "none";

export interface NameCandidate {
  name: string;
  score: number;
}

interface IndexEntry extends MatchForms {
  name: string;
}

interface CardNameIndex {
  entries: IndexEntry[];
  byToken: Map<string, number[]>;
  bySquash: Map<string, number[]>;
}

// --- Catalogue loading ----------------------------------------------------

interface CacheRow {
  payload: unknown;
  fetchedAt: Date;
}

async function readCache(): Promise<CacheRow | null> {
  return db.catalogCache.findUnique({
    where: { key: CACHE_KEY },
    select: { payload: true, fetchedAt: true },
  });
}

async function writeCache(names: string[]): Promise<void> {
  const now = new Date();
  await db.catalogCache.upsert({
    where: { key: CACHE_KEY },
    create: { key: CACHE_KEY, payload: names, fetchedAt: now },
    update: { payload: names, fetchedAt: now },
  });
}

/**
 * Card names from the local cache, refreshing from Scryfall when the cache is
 * missing or stale. A failed refresh falls back to the stale copy rather than
 * taking the feature down.
 */
async function loadCardNames(): Promise<string[]> {
  const cached = await readCache();
  const fresh = cached && Date.now() - cached.fetchedAt.getTime() < MAX_AGE_MS;

  if (cached && fresh && Array.isArray(cached.payload)) {
    return cached.payload as string[];
  }

  try {
    const names = await fetchCardNameCatalog();
    if (names.length > 0) {
      await writeCache(names);
      return names;
    }
  } catch (err) {
    console.error("Scryfall card-name catalogue refresh failed:", err);
  }

  if (cached && Array.isArray(cached.payload)) {
    return cached.payload as string[];
  }
  return [];
}

// --- Index ----------------------------------------------------------------

function push(map: Map<string, number[]>, key: string, id: number) {
  if (!key) return;
  const bucket = map.get(key);
  if (bucket) bucket.push(id);
  else map.set(key, [id]);
}

function buildIndex(names: string[]): CardNameIndex {
  const entries: IndexEntry[] = [];
  const byToken = new Map<string, number[]>();
  const bySquash = new Map<string, number[]>();

  for (const name of names) {
    // Arena rebalanced cards ("A-Lightning Bolt") are never spoken aloud and
    // only add near-duplicate noise to every result list.
    if (name.startsWith("A-")) continue;

    const forms = buildForms(name);
    if (!forms.normalized) continue;

    const id = entries.length;
    entries.push({ name, ...forms });

    for (const t of new Set(forms.tokens)) push(byToken, t, id);
    for (const s of new Set(forms.squashedTokens)) push(bySquash, s, id);
  }

  return { entries, byToken, bySquash };
}

let indexPromise: Promise<CardNameIndex> | null = null;

/** Build once per process; concurrent callers share the same in-flight build. */
export function getCardNameIndex(): Promise<CardNameIndex> {
  if (!indexPromise) {
    indexPromise = loadCardNames()
      .then(buildIndex)
      .catch((err) => {
        indexPromise = null; // let the next request retry
        throw err;
      });
  }
  return indexPromise;
}

/** Drop the cached catalogue and in-memory index. Exposed for tests/admin. */
export async function invalidateCardNameIndex(): Promise<void> {
  indexPromise = null;
  await db.catalogCache.deleteMany({ where: { key: CACHE_KEY } });
}

// --- Matching -------------------------------------------------------------

/**
 * Gather a bounded candidate set. Exact and phonetic token hits cover almost
 * everything; the length-and-prefix sweep catches queries whose tokens were all
 * mangled ("solring"), without ever scoring all 35k entries.
 */
function candidateIds(index: CardNameIndex, query: MatchForms): number[] {
  const ids = new Set<number>();

  for (const t of new Set(query.tokens)) {
    for (const id of index.byToken.get(t) ?? []) ids.add(id);
  }
  for (const s of new Set(query.squashedTokens)) {
    for (const id of index.bySquash.get(s) ?? []) ids.add(id);
  }

  // Always length-bounded, so this stays cheap even on a total miss.
  const qLen = query.joined.length;
  const tolerance = Math.max(3, Math.round(qLen * 0.34));
  const head = query.joined.slice(0, 2);
  for (let i = 0; i < index.entries.length; i++) {
    const e = index.entries[i];
    if (Math.abs(e.joined.length - qLen) > tolerance) continue;
    if (head && !e.joined.startsWith(head) && !e.squashedJoined.startsWith(head[0])) continue;
    ids.add(i);
  }

  return [...ids];
}

export interface MatchResult {
  decision: MatchDecision;
  candidates: NameCandidate[];
}

/** Rank catalogue names against a spoken query. */
export async function matchCardName(query: string, limit = 3): Promise<MatchResult> {
  const forms = buildForms(query);
  if (!forms.normalized) return { decision: "none", candidates: [] };

  const index = await getCardNameIndex();
  if (index.entries.length === 0) return { decision: "none", candidates: [] };

  const tokenSet = new Set(forms.tokens);
  const squashSet = new Set(forms.squashedTokens);

  const scored: NameCandidate[] = [];
  for (const id of candidateIds(index, forms)) {
    const entry = index.entries[id];
    const score = scoreCandidate(forms, tokenSet, squashSet, entry);
    if (score >= 0.4) scored.push({ name: entry.name, score });
  }

  scored.sort((a, b) => b.score - a.score || a.name.length - b.name.length);
  const candidates = scored.slice(0, limit);

  const best = candidates[0]?.score ?? 0;
  const decision: MatchDecision =
    best >= AUTO_ACCEPT ? "auto" : best >= CONFIRM_FLOOR ? "confirm" : "none";

  return { decision, candidates: decision === "none" ? [] : candidates };
}
