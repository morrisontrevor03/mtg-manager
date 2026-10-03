import { db } from "@/lib/db";
import type { Card, Deck, DeckCard } from "@prisma/client";
import type { Color } from "@/lib/types";

type DeckWithRelations = Deck & {
  commander: Card | null;
  cards: (DeckCard & { card: Card })[];
};

export interface SerializedDeckCard {
  id: string;
  name: string;
  quantity: number;
  role: "commander" | "mainboard" | "sideboard";
  owned: boolean;
  acquire: boolean;
  estPrice: number | null;
  typeLine: string;
  manaCost: string;
  cmc: number;
  colors: Color[];
  rarity: string;
  imageUri: string;
  scryfallUri: string;
}

export interface SerializedDeck {
  id: string;
  name: string;
  format: "standard" | "commander";
  status: string;
  description: string;
  colors: Color[];
  llmModel: string;
  llmPrompt: string;
  llmRationale: string;
  manaBaseNotes: string;
  createdAt: string;
  updatedAt: string;
  commander: { name: string; imageUri: string } | null;
  groups: {
    commander: SerializedDeckCard[];
    mainboard: SerializedDeckCard[];
    sideboard: SerializedDeckCard[];
  };
  totals: {
    mainboardCount: number;
    sideboardCount: number;
    ownedValueUsd: number;
    acquireCount: number;
    acquireCostUsd: number;
  };
}

export function serializeDeck(deck: DeckWithRelations): SerializedDeck {
  const rows: SerializedDeckCard[] = deck.cards.map((dc) => ({
    id: dc.id,
    name: dc.card.name,
    quantity: dc.quantity,
    role: dc.role as SerializedDeckCard["role"],
    owned: dc.owned,
    acquire: dc.acquire,
    estPrice: dc.estPrice,
    typeLine: dc.card.typeLine,
    manaCost: dc.card.manaCost,
    cmc: dc.card.cmc,
    colors: (dc.card.colors as Color[]) ?? [],
    rarity: dc.card.rarity,
    imageUri: dc.card.imageUri,
    scryfallUri: dc.card.scryfallUri,
  }));

  const byRole = (role: string) =>
    rows.filter((r) => r.role === role).sort((a, b) => a.cmc - b.cmc || a.name.localeCompare(b.name));

  const commander = byRole("commander");
  const mainboard = byRole("mainboard");
  const sideboard = byRole("sideboard");

  const sum = (list: SerializedDeckCard[]) => list.reduce((n, c) => n + c.quantity, 0);

  const acquireRows = rows.filter((r) => r.acquire);
  const ownedRows = rows.filter((r) => !r.acquire);

  return {
    id: deck.id,
    name: deck.name,
    format: deck.format as SerializedDeck["format"],
    status: deck.status,
    description: deck.description,
    colors: (deck.colors as Color[]) ?? [],
    llmModel: deck.llmModel,
    llmPrompt: deck.llmPrompt,
    llmRationale: deck.llmRationale,
    manaBaseNotes: deck.manaBaseNotes,
    createdAt: deck.createdAt.toISOString(),
    updatedAt: deck.updatedAt.toISOString(),
    commander: deck.commander
      ? { name: deck.commander.name, imageUri: deck.commander.imageUri }
      : null,
    groups: { commander, mainboard, sideboard },
    totals: {
      mainboardCount: sum(commander) + sum(mainboard),
      sideboardCount: sum(sideboard),
      ownedValueUsd:
        Math.round(ownedRows.reduce((n, c) => n + c.quantity * (c.estPrice ?? 0), 0) * 100) / 100,
      acquireCount: sum(acquireRows),
      acquireCostUsd:
        Math.round(acquireRows.reduce((n, c) => n + c.quantity * (c.estPrice ?? 0), 0) * 100) / 100,
    },
  };
}

/** A user's deck by id; another user's deck is reported as not found. */
export async function getDeck(userId: string, id: string): Promise<SerializedDeck | null> {
  const deck = await db.deck.findFirst({
    where: { id, userId },
    include: { commander: true, cards: { include: { card: true } } },
  });
  return deck ? serializeDeck(deck) : null;
}
