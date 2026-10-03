import { db } from "@/lib/db";
import { handle, ok, badRequest } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { parseCardList } from "@/lib/csv";
import { addOwnedCard } from "@/lib/collection";
import { fetchCollection, upsertCard } from "@/lib/scryfall";

export const runtime = "nodejs";
// Large imports hit Scryfall in batches of 75 with a 100ms gap between calls.
export const maxDuration = 300;

async function readText(req: Request): Promise<string> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (file instanceof File) return await file.text();
    const text = form.get("text");
    return typeof text === "string" ? text : "";
  }
  if (ct.includes("application/json")) {
    const body = (await req.json()) as { text?: string };
    return body.text ?? "";
  }
  return await req.text();
}

export function POST(req: Request) {
  return handle(async () => {
    const userId = await requireUser(req);
    const text = await readText(req);
    const parsed = parseCardList(text);
    if (parsed.length === 0) return badRequest("No card names found in the import.");

    const qtyByName = new Map(parsed.map((p) => [p.name.toLowerCase(), p.quantity]));
    const { found, notFound } = await fetchCollection(parsed.map((p) => p.name));

    const matched: { name: string; quantity: number }[] = [];
    let addedCopies = 0;

    for (const sc of found) {
      const cardId = await upsertCard(sc);
      const qty =
        qtyByName.get(sc.name.toLowerCase()) ??
        parsed.find((p) => sc.name.toLowerCase().startsWith(p.name.toLowerCase()))?.quantity ??
        1;
      await addOwnedCard(userId, { cardId, quantity: qty });
      matched.push({ name: sc.name, quantity: qty });
      addedCopies += qty;
    }

    const [uniqueCards, totalCopies] = await Promise.all([
      db.collectionItem.count({ where: { userId } }),
      db.collectionItem
        .aggregate({ where: { userId }, _sum: { quantity: true } })
        .then((r) => r._sum.quantity ?? 0),
    ]);

    return ok({
      requested: parsed.length,
      matchedCount: matched.length,
      addedCopies,
      unmatched: notFound,
      matched,
      collection: { uniqueCards, totalCopies },
    });
  });
}
