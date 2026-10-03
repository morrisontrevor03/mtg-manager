import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ok, notFound } from "@/lib/http";
import { serializeDeck } from "@/lib/deck";

export const runtime = "nodejs";

export function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const deck = await db.deck.findUnique({
      where: { id },
      include: { commander: true, cards: { include: { card: true } } },
    });
    if (!deck) return notFound("Deck not found");
    return ok(serializeDeck(deck));
  });
}

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(["draft", "final"]).optional(),
  description: z.string().max(2000).optional(),
});

export function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = PatchBody.parse(await req.json());
    const deck = await db.deck.update({ where: { id }, data: body }).catch(() => null);
    if (!deck) return notFound("Deck not found");
    return ok({ id: deck.id, name: deck.name, status: deck.status });
  });
}

export function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    await db.deck.delete({ where: { id } }).catch(() => undefined);
    return ok({ deleted: true });
  });
}
