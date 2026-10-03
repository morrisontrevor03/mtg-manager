import { db } from "@/lib/db";
import type { CardPrices, Color, Format, Legalities, OwnedCard } from "@/lib/types";

function priceUsd(prices: CardPrices, foil: boolean): number {
  const raw = foil ? prices.usd_foil ?? prices.usd : prices.usd;
  const n = parseFloat(raw ?? "");
  return Number.isFinite(n) ? n : 0;
}

interface CardRowLike {
  id: string;
  name: string;
  typeLine: string;
  manaCost: string;
  cmc: number;
  colors: unknown;
  colorIdentity: unknown;
  rarity: string;
  oracleText: string;
  legalities: unknown;
  prices: unknown;
  imageUri: string;
}

export function toOwnedCard(card: CardRowLike, quantity: number, foil: boolean): OwnedCard {
  return {
    cardId: card.id,
    name: card.name,
    quantity,
    foil,
    typeLine: card.typeLine,
    manaCost: card.manaCost,
    cmc: card.cmc,
    colors: (card.colors as Color[]) ?? [],
    colorIdentity: (card.colorIdentity as Color[]) ?? [],
    rarity: card.rarity,
    oracleText: card.oracleText,
    legalities: (card.legalities as Legalities) ?? {},
    priceUsd: priceUsd(card.prices as CardPrices, foil),
    imageUri: card.imageUri,
  };
}

export interface AddOwnedInput {
  cardId: string;
  quantity?: number;
  foil?: boolean;
  condition?: string;
  acquiredPrice?: number | null;
  notes?: string;
}

/** Add copies of a card to a user's collection, merging with any existing (card, foil) row. */
export async function addOwnedCard(userId: string, input: AddOwnedInput) {
  const quantity = Math.max(1, Math.trunc(input.quantity ?? 1));
  const foil = input.foil ?? false;
  return db.collectionItem.upsert({
    where: { userId_cardId_foil: { userId, cardId: input.cardId, foil } },
    create: {
      userId,
      cardId: input.cardId,
      foil,
      quantity,
      condition: input.condition ?? "NM",
      acquiredPrice: input.acquiredPrice ?? null,
      notes: input.notes ?? "",
    },
    update: { quantity: { increment: quantity } },
  });
}

/** All of a user's owned cards, one entry per (card, foil) row. */
export async function getOwnedCards(userId: string): Promise<OwnedCard[]> {
  const items = await db.collectionItem.findMany({ where: { userId }, include: { card: true } });
  return items.map((it) => toOwnedCard(it.card, it.quantity, it.foil));
}

/** Owned cards that are legal in the given format (ignores colour identity). */
export async function getFormatLegalOwnedCards(
  userId: string,
  format: Format,
): Promise<OwnedCard[]> {
  const all = await getOwnedCards(userId);
  const key = format === "commander" ? "commander" : "standard";
  return all.filter((c) => c.legalities[key] === "legal");
}

/** Owned legendary creatures that are Commander-legal — candidate commanders. */
export async function getCommanderCandidates(userId: string): Promise<OwnedCard[]> {
  const legal = await getFormatLegalOwnedCards(userId, "commander");
  return legal
    .filter((c) => {
      const t = c.typeLine.toLowerCase();
      return (
        (t.includes("legendary") && t.includes("creature")) ||
        /can be your commander/i.test(c.oracleText)
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
