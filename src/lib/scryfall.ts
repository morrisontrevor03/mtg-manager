import { db } from "@/lib/db";
import type { Color } from "@/lib/types";

const API = "https://api.scryfall.com";
const UA = process.env.SCRYFALL_UA || "MTGManager/0.1";

// --- Scryfall response shapes (only the fields we use) ---------------------

interface ScryfallImageUris {
  normal?: string;
  large?: string;
  small?: string;
}

interface ScryfallCardFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  image_uris?: ScryfallImageUris;
}

export interface ScryfallCard {
  id: string;
  oracle_id?: string;
  name: string;
  set: string;
  collector_number: string;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  color_identity?: string[];
  rarity?: string;
  layout?: string;
  image_uris?: ScryfallImageUris;
  card_faces?: ScryfallCardFace[];
  prices?: Record<string, string | null>;
  legalities?: Record<string, string>;
  scryfall_uri?: string;
}

// --- Rate-limited fetch ---------------------------------------------------

// Scryfall asks for ~50-100ms between requests. Serialize all calls through
// a single promise chain and space them out.
let chain: Promise<unknown> = Promise.resolve();
const GAP_MS = 100;

function schedule<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const result = await fn();
    await new Promise((r) => setTimeout(r, GAP_MS));
    return result;
  });
  // Keep the chain alive even if this call rejects.
  chain = run.catch(() => undefined);
  return run;
}

async function sfGet<T>(path: string): Promise<T> {
  return schedule(async () => {
    const res = await fetch(`${API}${path}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new ScryfallError(res.status, body);
    }
    return (await res.json()) as T;
  });
}

async function sfPost<T>(path: string, body: unknown): Promise<T> {
  return schedule(async () => {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new ScryfallError(res.status, text);
    }
    return (await res.json()) as T;
  });
}

export class ScryfallError extends Error {
  constructor(
    public status: number,
    body: string,
  ) {
    super(`Scryfall ${status}: ${body.slice(0, 200)}`);
    this.name = "ScryfallError";
  }
}

// --- Normalisation ------------------------------------------------------

function faceJoin(card: ScryfallCard, key: "mana_cost" | "oracle_text" | "type_line"): string {
  const top = card[key];
  if (top) return top;
  if (card.card_faces?.length) {
    return card.card_faces
      .map((f) => f[key] || "")
      .filter(Boolean)
      .join(" // ");
  }
  return "";
}

function imageOf(card: ScryfallCard): string {
  return (
    card.image_uris?.normal ||
    card.image_uris?.large ||
    card.card_faces?.[0]?.image_uris?.normal ||
    card.card_faces?.[0]?.image_uris?.large ||
    ""
  );
}

function colorsOf(card: ScryfallCard): Color[] {
  const set = new Set<string>(card.colors ?? []);
  if (!card.colors && card.card_faces) {
    for (const f of card.card_faces) for (const c of f.colors ?? []) set.add(c);
  }
  return [...set] as Color[];
}

/** Upsert a Scryfall card into the local catalogue and return its DB id. */
export async function upsertCard(card: ScryfallCard): Promise<string> {
  const data = {
    scryfallId: card.id,
    oracleId: card.oracle_id ?? card.id,
    name: card.name,
    setCode: card.set,
    collectorNumber: card.collector_number,
    manaCost: faceJoin(card, "mana_cost"),
    cmc: card.cmc ?? 0,
    typeLine: faceJoin(card, "type_line"),
    oracleText: faceJoin(card, "oracle_text"),
    colors: colorsOf(card),
    colorIdentity: (card.color_identity ?? []) as Color[],
    rarity: card.rarity ?? "",
    layout: card.layout ?? "normal",
    imageUri: imageOf(card),
    prices: card.prices ?? {},
    legalities: card.legalities ?? {},
    scryfallUri: card.scryfall_uri ?? "",
  };
  const row = await db.card.upsert({
    where: { scryfallId: card.id },
    create: data,
    update: data,
  });
  return row.id;
}

// --- Public API -------------------------------------------------------

/** Resolve a single card by name (exact first, then fuzzy). */
export async function resolveByName(name: string, set?: string): Promise<ScryfallCard | null> {
  const q = new URLSearchParams({ exact: name });
  if (set) q.set("set", set);
  try {
    return await sfGet<ScryfallCard>(`/cards/named?${q}`);
  } catch (e) {
    if (e instanceof ScryfallError && e.status === 404) {
      try {
        const fq = new URLSearchParams({ fuzzy: name });
        if (set) fq.set("set", set);
        return await sfGet<ScryfallCard>(`/cards/named?${fq}`);
      } catch (e2) {
        if (e2 instanceof ScryfallError && e2.status === 404) return null;
        throw e2;
      }
    }
    throw e;
  }
}

/** Autocomplete card names for the manual-add form. */
export async function autocomplete(query: string): Promise<string[]> {
  if (query.trim().length < 2) return [];
  const q = new URLSearchParams({ q: query });
  const res = await sfGet<{ data: string[] }>(`/cards/autocomplete?${q}`);
  return res.data ?? [];
}

/**
 * Every card name Scryfall knows (~35k). Used to build the voice-matching
 * index; callers should cache the result rather than refetch per request.
 */
export async function fetchCardNameCatalog(): Promise<string[]> {
  const res = await sfGet<{ data: string[] }>("/catalog/card-names");
  return res.data ?? [];
}

export interface CollectionLookup {
  found: ScryfallCard[];
  notFound: string[];
}

/** Batch-resolve up to any number of names via /cards/collection (75 per call). */
export async function fetchCollection(names: string[]): Promise<CollectionLookup> {
  const found: ScryfallCard[] = [];
  const notFound: string[] = [];
  for (let i = 0; i < names.length; i += 75) {
    const batch = names.slice(i, i + 75);
    const res = await sfPost<{
      data: ScryfallCard[];
      not_found: { name?: string }[];
    }>("/cards/collection", { identifiers: batch.map((name) => ({ name })) });
    found.push(...(res.data ?? []));
    // Scryfall echoes back the identifier objects it could not match.
    for (const nf of res.not_found ?? []) {
      notFound.push(nf.name ?? "(unknown)");
    }
  }
  return { found, notFound };
}
