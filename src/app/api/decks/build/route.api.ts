import { z } from "zod";
import { handle, ok, badRequest } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { buildAndSaveDeck } from "@/lib/deckBuilder";
import { MissingApiKeyError } from "@/lib/claude";

export const runtime = "nodejs";
// The LLM call plus up to one retry and Scryfall lookups can take a while.
export const maxDuration = 300;

const Body = z.object({
  format: z.enum(["standard", "commander"]),
  prompt: z.string().min(3).max(2000),
  commanderName: z.string().max(200).optional(),
  allowAcquire: z.boolean().default(true),
  budgetUsd: z.number().positive().max(100000).optional(),
});

export function POST(req: Request) {
  return handle(async () => {
    const userId = await requireUser(req);
    const body = Body.parse(await req.json());

    try {
      const result = await buildAndSaveDeck({
        userId,
        format: body.format,
        prompt: body.prompt,
        commanderName: body.commanderName?.trim() || undefined,
        allowAcquire: body.allowAcquire,
        budgetUsd: body.budgetUsd,
      });
      return ok(result, { status: 201 });
    } catch (err) {
      if (err instanceof MissingApiKeyError) return badRequest(err.message);
      throw err;
    }
  });
}
