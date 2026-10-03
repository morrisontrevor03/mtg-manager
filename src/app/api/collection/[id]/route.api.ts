import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ok, notFound } from "@/lib/http";

export const runtime = "nodejs";

const PatchBody = z.object({
  quantity: z.number().int().min(0).max(999).optional(),
  foil: z.boolean().optional(),
  condition: z.string().optional(),
  notes: z.string().optional(),
});

export function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = PatchBody.parse(await req.json());

    // Deleting the last copy removes the row entirely.
    if (body.quantity === 0) {
      await db.collectionItem.delete({ where: { id } }).catch(() => undefined);
      return ok({ deleted: true });
    }

    const item = await db.collectionItem.update({ where: { id }, data: body }).catch(() => null);
    if (!item) return notFound("Collection item not found");
    return ok({ id: item.id, quantity: item.quantity, foil: item.foil });
  });
}

export function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    await db.collectionItem.delete({ where: { id } }).catch(() => undefined);
    return ok({ deleted: true });
  });
}
