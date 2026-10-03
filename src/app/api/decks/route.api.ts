import { db } from "@/lib/db";
import { handle, ok } from "@/lib/http";

export const runtime = "nodejs";

export function GET() {
  return handle(async () => {
    const decks = await db.deck.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        commander: { select: { name: true, imageUri: true } },
        cards: { select: { quantity: true, acquire: true, role: true } },
      },
    });

    return ok({
      decks: decks.map((d) => {
        const cardCount = d.cards
          .filter((c) => c.role !== "sideboard")
          .reduce((n, c) => n + c.quantity, 0);
        const toAcquire = d.cards.filter((c) => c.acquire).reduce((n, c) => n + c.quantity, 0);
        return {
          id: d.id,
          name: d.name,
          format: d.format,
          description: d.description,
          status: d.status,
          colors: d.colors,
          commander: d.commander,
          cardCount,
          toAcquire,
          updatedAt: d.updatedAt.toISOString(),
        };
      }),
    });
  });
}
