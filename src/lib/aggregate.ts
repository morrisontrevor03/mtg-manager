import { db } from "@/lib/db";
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
  recent: {
    name: string;
    setCode: string;
    quantity: number;
    imageUri: string;
    addedAt: string;
  }[];
}

function priceOf(prices: CardPrices, foil: boolean): number {
  const raw = foil ? prices.usd_foil ?? prices.usd : prices.usd;
  const n = parseFloat(raw ?? "");
  return Number.isFinite(n) ? n : 0;
}

function primaryType(typeLine: string): string {
  const t = typeLine.toLowerCase();
  for (const known of [
    "Land",
    "Creature",
    "Planeswalker",
    "Instant",
    "Sorcery",
    "Artifact",
    "Enchantment",
    "Battle",
  ]) {
    if (t.includes(known.toLowerCase())) return known;
  }
  return "Other";
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

export async function getDashboardData(): Promise<DashboardData> {
  const [items, decks] = await Promise.all([
    db.collectionItem.findMany({ include: { card: true }, orderBy: { createdAt: "desc" } }),
    db.deck.groupBy({ by: ["format"], _count: { _all: true } }),
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
    bumpMap(rarities, c.rarity || "unknown", qty);
    bumpMap(sets, c.setCode.toUpperCase(), qty);

    if (type !== "Land") {
      const cmc = Math.max(0, Math.floor(c.cmc));
      bumpMap(curve, cmc >= 7 ? "7+" : String(cmc), qty);
    }
  }

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
    rarityBreakdown: toBuckets(rarities, ["common", "uncommon", "rare", "mythic", "unknown"]),
    manaCurve: toBuckets(curve, ["0", "1", "2", "3", "4", "5", "6", "7+"]),
    topSets: toBuckets(sets).slice(0, 8),
    recent: items.slice(0, 10).map((it) => ({
      name: it.card.name,
      setCode: it.card.setCode.toUpperCase(),
      quantity: it.quantity,
      imageUri: it.card.imageUri,
      addedAt: it.createdAt.toISOString(),
    })),
  };
}
