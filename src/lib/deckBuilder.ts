import { db } from "@/lib/db";
import { buildDeckDraft, DECK_BUILDER_MODEL, type DeckDraft } from "@/lib/claude";
import { validateDeck, type RuleCard } from "@/lib/deckRules";
import { getFormatLegalOwnedCards } from "@/lib/collection";
import { fetchCollection, resolveByName, upsertCard } from "@/lib/scryfall";
import type { Color, Format, Legalities } from "@/lib/types";
import type { Archetype } from "@/lib/deckParams";
import type { Card } from "@prisma/client";

export interface BuildDeckResult {
  deckId: string;
  ok: boolean;
  violations: string[];
  unresolved: string[];
  shortfalls: string[];
}

export interface BuildDeckOptions {
  /** Owner of the collection the deck is built from, and of the saved deck. */
  userId: string;
  format: Format;
  prompt: string;
  commanderName?: string;
  /** Colours the deck must stay within; ignored when a commander is named. */
  colors?: Color[];
  archetype?: Archetype;
  allowAcquire: boolean;
  budgetUsd?: number;
}

function withinIdentity(identity: Color[], commander: Color[]): boolean {
  const allowed = new Set(commander);
  return identity.every((c) => allowed.has(c));
}

/** Match draft card names to catalogue rows, fetching any misses from Scryfall. */
async function resolveCards(names: string[]): Promise<{
  byName: Map<string, Card>;
  unresolved: string[];
}> {
  const unique = [...new Set(names)];
  const lookup = (rows: Card[]) => {
    const m = new Map<string, Card>();
    for (const r of rows) m.set(r.name.toLowerCase(), r);
    return m;
  };

  let byName = lookup(await db.card.findMany({ where: { name: { in: unique } } }));

  const missing = unique.filter((n) => !byName.has(n.toLowerCase()));
  const unresolved: string[] = [];

  if (missing.length) {
    const { found, notFound } = await fetchCollection(missing);
    for (const sc of found) await upsertCard(sc);
    unresolved.push(...notFound);
    byName = lookup(
      await db.card.findMany({ where: { name: { in: unique } } }),
    );
    // Anything still missing (e.g. odd casing from the model) — try one-by-one.
    for (const n of unique) {
      if (byName.has(n.toLowerCase()) || unresolved.some((u) => u.toLowerCase() === n.toLowerCase()))
        continue;
      const sc = await resolveByName(n);
      if (sc) {
        await upsertCard(sc);
      } else {
        unresolved.push(n);
      }
    }
    byName = lookup(await db.card.findMany({ where: { name: { in: unique } } }));
  }

  return { byName, unresolved };
}

function toRuleCard(draftCard: DeckDraft["cards"][number], card: Card): RuleCard {
  return {
    name: card.name,
    quantity: draftCard.quantity,
    role: draftCard.role,
    typeLine: card.typeLine,
    oracleText: card.oracleText,
    colorIdentity: (card.colorIdentity as Color[]) ?? [],
    legalities: (card.legalities as Legalities) ?? {},
  };
}

export async function buildAndSaveDeck(opts: BuildDeckOptions): Promise<BuildDeckResult> {
  const ownedLegal = await getFormatLegalOwnedCards(opts.userId, opts.format);

  // Resolve an explicit commander up front so we can steer the card pool.
  let commanderCard: Card | null = null;
  if (opts.format === "commander" && opts.commanderName) {
    commanderCard =
      (await db.card.findFirst({
        where: { name: { equals: opts.commanderName } },
      })) ?? null;
    if (!commanderCard) {
      const sc = await resolveByName(opts.commanderName);
      if (sc) commanderCard = await db.card.findUnique({ where: { id: await upsertCard(sc) } });
    }
  }

  const commanderIdentity = (commanderCard?.colorIdentity as Color[] | undefined) ?? undefined;
  // A named commander fixes the colours; otherwise honour any the player picked.
  const requestedColors = commanderIdentity ? [] : (opts.colors ?? []);
  const poolIdentity = commanderIdentity ?? (requestedColors.length ? requestedColors : undefined);
  let pool = ownedLegal;
  if (poolIdentity) {
    pool = ownedLegal.filter((c) => withinIdentity(c.colorIdentity, poolIdentity));
  }

  const draftInput = {
    format: opts.format,
    prompt: opts.prompt,
    ownedCards: pool,
    commanderName: opts.commanderName,
    colors: requestedColors,
    archetype: opts.archetype,
    allowAcquire: opts.allowAcquire,
    budgetUsd: opts.budgetUsd,
  };

  // --- LLM draft, with one validation-driven retry --------------------
  let draft = await buildDeckDraft(draftInput);

  let resolved = await resolveCards(draft.cards.map((c) => c.name));
  let ruleCards = draft.cards
    .map((dc) => {
      const card = resolved.byName.get(dc.name.toLowerCase());
      return card ? toRuleCard(dc, card) : null;
    })
    .filter((x): x is RuleCard => x !== null);
  let validation = validateDeck(opts.format, ruleCards, { colors: requestedColors });

  if (!validation.ok || resolved.unresolved.length) {
    const feedback = [
      ...validation.violations,
      ...resolved.unresolved.map((n) => `"${n}" is not a real card — replace it.`),
    ];
    draft = await buildDeckDraft({
      ...draftInput,
      retryViolations: feedback,
      previousDraft: draft,
    });
    resolved = await resolveCards(draft.cards.map((c) => c.name));
    ruleCards = draft.cards
      .map((dc) => {
        const card = resolved.byName.get(dc.name.toLowerCase());
        return card ? toRuleCard(dc, card) : null;
      })
      .filter((x): x is RuleCard => x !== null);
    validation = validateDeck(opts.format, ruleCards, { colors: requestedColors });
  }

  // --- Reconcile ownership against the real collection ---------------
  const ownedQty = new Map<string, number>();
  {
    const items = await db.collectionItem.findMany({
      where: { userId: opts.userId },
      include: { card: true },
    });
    for (const it of items) {
      const k = it.card.name.toLowerCase();
      ownedQty.set(k, (ownedQty.get(k) ?? 0) + it.quantity);
    }
  }

  const shortfalls: string[] = [];
  const persistCards = draft.cards
    .map((dc) => {
      const card = resolved.byName.get(dc.name.toLowerCase());
      if (!card) return null;
      const have = ownedQty.get(card.name.toLowerCase()) ?? 0;
      const owned = have >= dc.quantity;
      const acquire = !owned;
      if (acquire && !opts.allowAcquire) {
        shortfalls.push(`Only ${have}/${dc.quantity} copies of ${card.name} owned.`);
      }
      return {
        cardId: card.id,
        quantity: dc.quantity,
        role: dc.role,
        owned,
        acquire,
        estPrice: parseFloat((card.prices as { usd?: string })?.usd ?? "") || null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Deduplicate on the DeckCard unique key (deckId, cardId, role).
  const seen = new Set<string>();
  const uniqueCards = persistCards.filter((c) => {
    const k = `${c.cardId}:${c.role}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const resolvedCommander =
    commanderCard ??
    (() => {
      const dc = draft.cards.find((c) => c.role === "commander");
      return dc ? resolved.byName.get(dc.name.toLowerCase()) ?? null : null;
    })();

  const colorSet = new Set<Color>();
  for (const rc of ruleCards) for (const c of rc.colorIdentity) colorSet.add(c);

  const deck = await db.deck.create({
    data: {
      userId: opts.userId,
      name: draft.deckName || `${opts.format} deck`,
      format: opts.format,
      description: draft.strategy,
      commanderCardId: resolvedCommander?.id ?? null,
      colors: [...colorSet],
      llmModel: DECK_BUILDER_MODEL,
      llmPrompt: opts.prompt,
      llmRationale: draft.rationale,
      manaBaseNotes: draft.manaBaseNotes,
      status: "draft",
      cards: { create: uniqueCards },
    },
  });

  return {
    deckId: deck.id,
    ok: validation.ok && resolved.unresolved.length === 0 && shortfalls.length === 0,
    violations: validation.violations,
    unresolved: resolved.unresolved,
    shortfalls,
  };
}
