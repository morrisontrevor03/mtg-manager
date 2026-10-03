import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ok, notFound } from "@/lib/http";
import { getDeck } from "@/lib/deck";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

// Every query filters on the owner as well as the id, so another account's deck
// is indistinguishable from one that does not exist.

export function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const userId = await requireUser(req);
    const { id } = await ctx.params;
    const deck = await getDeck(userId, id);
    if (!deck) return notFound("Deck not found");
    return ok(deck);
  });
}

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(["draft", "final"]).optional(),
  description: z.string().max(2000).optional(),
});

export function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const userId = await requireUser(req);
    const { id } = await ctx.params;
    const body = PatchBody.parse(await req.json());

    const { count } = await db.deck.updateMany({ where: { id, userId }, data: body });
    if (count === 0) return notFound("Deck not found");

    const deck = await db.deck.findFirst({ where: { id, userId } });
    if (!deck) return notFound("Deck not found");
    return ok({ id: deck.id, name: deck.name, status: deck.status });
  });
}

export function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const userId = await requireUser(req);
    const { id } = await ctx.params;
    // DeckCard rows go with it via the cascade on DeckCard.deckId.
    await db.deck.deleteMany({ where: { id, userId } });
    return ok({ deleted: true });
  });
}
