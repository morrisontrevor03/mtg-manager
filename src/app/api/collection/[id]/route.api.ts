import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ok, notFound } from "@/lib/http";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

const PatchBody = z.object({
  quantity: z.number().int().min(0).max(999).optional(),
  foil: z.boolean().optional(),
  condition: z.string().optional(),
  notes: z.string().optional(),
});

// Every write filters on the owner as well as the id, so an id belonging to
// another account matches nothing and reads as "not found".

export function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const userId = await requireUser(req);
    const { id } = await ctx.params;
    const body = PatchBody.parse(await req.json());

    // Deleting the last copy removes the row entirely.
    if (body.quantity === 0) {
      await db.collectionItem.deleteMany({ where: { id, userId } });
      return ok({ deleted: true });
    }

    const { count } = await db.collectionItem
      .updateMany({ where: { id, userId }, data: body })
      .catch(() => ({ count: 0 }));
    if (count === 0) return notFound("Collection item not found");

    const item = await db.collectionItem.findFirst({ where: { id, userId } });
    if (!item) return notFound("Collection item not found");
    return ok({ id: item.id, quantity: item.quantity, foil: item.foil });
  });
}

export function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const userId = await requireUser(req);
    const { id } = await ctx.params;
    await db.collectionItem.deleteMany({ where: { id, userId } });
    return ok({ deleted: true });
  });
}
