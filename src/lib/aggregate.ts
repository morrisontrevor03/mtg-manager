import { db } from "@/lib/db";
import { CURVE_COLUMNS, curveBucket, primaryType } from "@/lib/cardTypes";
import type { CardPrices, Color } from "@/lib/types";

export interface Bucket {
  label: string;
  value: number;
}

export interface DashboardData {
  totalCards: number;
  uniqueCards: number;
  totalValueUsd: number;
  deckCount: number;
  decksByFormat: Bucket[];
  colorBreakdown: Bucket[];
  typeBreakdown: Bucket[];
  rarityBreakdown: Bucket[];
  manaCurve: Bucket[];
  topSets: Bucket[];
  recent: DashboardCard[];
  /** The priciest printings owned, by single-copy price. */
  mostValuable: DashboardCard[];
}

/** One owned printing, with the metadata a collector reads it by. */
export interface DashboardCard {
  name: string;
  setCode: string;
  collectorNumber: string;
  rarity: string;
  manaCost: string;
  typeLine: string;
  foil: boolean;
  quantity: number;
  /** Single-copy price in USD (foil price for foils); 0 when unknown. */
  priceUsd: number;
  imageUri: string;
  addedAt: string;
}

/** Scryfall's `special` and `bonus` rarities are grouped; anything else is `unknown`. */
const RARITIES = ["common", "uncommon", "rare", "mythic", "special"];

function priceOf(prices: CardPrices, foil: boolean): number {
  const raw = foil ? prices.usd_foil ?? prices.usd : prices.usd;
  const n = parseFloat(raw ?? "");
  return Number.isFinite(n) ? n : 0;
}

function bumpMap(map: Map<string, number>, key: string, by: number) {
  map.set(key, (map.get(key) ?? 0) + by);
}

function toBuckets(map: Map<string, number>, order?: string[]): Bucket[] {
  if (order) {
    return order
      .filter((k) => map.has(k))
      .map((label) => ({ label, value: map.get(label) ?? 0 }));
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));
}

export async function getDashboardData(userId: string): Promise<DashboardData> {
  const [items, decks] = await Promise.all([
    db.collectionItem.findMany({
      where: { userId },
      include: { card: true },
      orderBy: { createdAt: "desc" },
    }),
    db.deck.groupBy({ by: ["format"], where: { userId }, _count: { _all: true } }),
  ]);

  let totalCards = 0;
  let totalValueUsd = 0;
  const colors = new Map<string, number>();
  const types = new Map<string, number>();
  const rarities = new Map<string, number>();
  const curve = new Map<string, number>();
  const sets = new Map<string, number>();

  for (const it of items) {
    const c = it.card;
    const qty = it.quantity;
    totalCards += qty;
    totalValueUsd += qty * priceOf(c.prices as CardPrices, it.foil);

    const cardColors = (c.colors as Color[]) ?? [];
    const colorKey =
      cardColors.length === 0
        ? "Colorless"
        : cardColors.length > 1
          ? "Multicolor"
          : ({ W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" }[cardColors[0]] ??
            "Colorless");
    bumpMap(colors, colorKey, qty);

    const type = primaryType(c.typeLine);
    bumpMap(types, type, qty);
    const rarity = c.rarity === "bonus" ? "special" : c.rarity;
    bumpMap(rarities, RARITIES.includes(rarity) ? rarity : "unknown", qty);
    bumpMap(sets, c.setCode.toUpperCase(), qty);

    if (type !== "Land") bumpMap(curve, curveBucket(c.cmc), qty);
  }

  const toCard = (it: (typeof items)[number]): DashboardCard => ({
    name: it.card.name,
    setCode: it.card.setCode.toUpperCase(),
    collectorNumber: it.card.collectorNumber,
    rarity: it.card.rarity,
    manaCost: it.card.manaCost,
    typeLine: it.card.typeLine,
    foil: it.foil,
    quantity: it.quantity,
    priceUsd: priceOf(it.card.prices as CardPrices, it.foil),
    imageUri: it.card.imageUri,
    addedAt: it.createdAt.toISOString(),
  });

  // A 0-cost spell (Ornithopter, a Mox) gets its own column only when owned.
  const curveOrder = curve.has("0") ? ["0", ...CURVE_COLUMNS] : CURVE_COLUMNS;

  return {
    totalCards,
    uniqueCards: items.length,
    totalValueUsd: Math.round(totalValueUsd * 100) / 100,
    deckCount: decks.reduce((n, d) => n + d._count._all, 0),
    decksByFormat: decks.map((d) => ({
      label: d.format === "commander" ? "Commander" : "Standard",
      value: d._count._all,
    })),
    colorBreakdown: toBuckets(colors, [
      "White",
      "Blue",
      "Black",
      "Red",
      "Green",
      "Multicolor",
      "Colorless",
    ]),
    typeBreakdown: toBuckets(types),
    rarityBreakdown: toBuckets(rarities, [...RARITIES, "unknown"]),
    manaCurve: curveOrder.map((label) => ({ label, value: curve.get(label) ?? 0 })),
    topSets: toBuckets(sets).slice(0, 6),
    recent: items.slice(0, 8).map(toCard),
    mostValuable: items
      .map(toCard)
      .filter((c) => c.priceUsd > 0)
      .sort((a, b) => b.priceUsd - a.priceUsd)
      .slice(0, 5),
  };
}
