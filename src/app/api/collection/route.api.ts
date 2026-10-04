import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ok, badRequest } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { addOwnedCard } from "@/lib/collection";
import { resolveByName, upsertCard } from "@/lib/scryfall";

export const runtime = "nodejs";

export function GET(req: Request) {
  return handle(async () => {
    const userId = await requireUser(req);
    const url = new URL(req.url);
    const search = url.searchParams.get("search")?.trim();
    // The collection page asks for 500 at once: it renders the whole collection
    // in one filterable table, as it did when it queried Prisma directly.
    const take = Math.min(500, Number(url.searchParams.get("take") ?? 100) || 100);
    const skip = Math.max(0, Number(url.searchParams.get("skip") ?? 0) || 0);

    // `mode: "insensitive"` keeps Postgres `contains` case-insensitive, matching
    // the behaviour the UI relies on.
    const where = search
      ? { userId, card: { is: { name: { contains: search, mode: "insensitive" as const } } } }
      : { userId };

    const [items, total] = await Promise.all([
      db.collectionItem.findMany({
        where,
        include: { card: true },
        orderBy: [{ card: { name: "asc" } }, { foil: "asc" }],
        take,
        skip,
      }),
      db.collectionItem.count({ where }),
    ]);

    return ok({
      total,
      items: items.map((it) => ({
        id: it.id,
        quantity: it.quantity,
        foil: it.foil,
        condition: it.condition,
        acquiredPrice: it.acquiredPrice,
        addedAt: it.createdAt.toISOString(),
        card: {
          id: it.card.id,
          name: it.card.name,
          setCode: it.card.setCode.toUpperCase(),
          collectorNumber: it.card.collectorNumber,
          typeLine: it.card.typeLine,
          manaCost: it.card.manaCost,
          cmc: it.card.cmc,
          oracleText: it.card.oracleText,
          rarity: it.card.rarity,
          colors: it.card.colors,
          imageUri: it.card.imageUri,
          prices: it.card.prices,
          scryfallUri: it.card.scryfallUri,
        },
      })),
    });
  });
}

const AddBody = z.object({
  name: z.string().min(1),
  set: z.string().optional(),
  quantity: z.number().int().positive().max(999).optional(),
  foil: z.boolean().optional(),
  condition: z.string().optional(),
  acquiredPrice: z.number().nonnegative().nullable().optional(),
  notes: z.string().optional(),
});

export function POST(req: Request) {
  return handle(async () => {
    const userId = await requireUser(req);
    const body = AddBody.parse(await req.json());
    const sc = await resolveByName(body.name, body.set);
    if (!sc) return badRequest(`No card named "${body.name}" was found on Scryfall.`);

    const cardId = await upsertCard(sc);
    const item = await addOwnedCard(userId, {
      cardId,
      quantity: body.quantity ?? 1,
      foil: body.foil,
      condition: body.condition,
      acquiredPrice: body.acquiredPrice ?? null,
      notes: body.notes,
    });

    // The full enriched record comes back so callers (voice entry) can render
    // the card the moment it lands, without a second round trip.
    const card = await db.card.findUnique({ where: { id: cardId } });

    return ok(
      {
        id: item.id,
        cardId,
        name: sc.name,
        quantity: item.quantity,
        foil: item.foil,
        card: card && {
          id: card.id,
          name: card.name,
          setCode: card.setCode.toUpperCase(),
          collectorNumber: card.collectorNumber,
          typeLine: card.typeLine,
          manaCost: card.manaCost,
          cmc: card.cmc,
          rarity: card.rarity,
          colors: card.colors,
          imageUri: card.imageUri,
          prices: card.prices,
          scryfallUri: card.scryfallUri,
        },
      },
      { status: 201 },
    );
  });
}
