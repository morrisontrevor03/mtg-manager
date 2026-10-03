import { z } from "zod";
import { handle, ok } from "@/lib/http";
import { matchCardName } from "@/lib/cardIndex";
import { parseVoiceInput } from "@/lib/voiceParse";

export const runtime = "nodejs";

const Body = z.object({
  transcript: z.string().max(300),
  /** How many candidates to return when confirmation is needed. */
  limit: z.number().int().min(1).max(5).optional(),
});

export function POST(req: Request) {
  return handle(async () => {
    const { transcript, limit } = Body.parse(await req.json());
    const intent = parseVoiceInput(transcript);

    // A control phrase never gets matched against the catalogue.
    if (intent.command) {
      return ok({
        raw: intent.raw,
        command: intent.command,
        quantity: intent.quantity,
        foil: intent.foil,
        query: "",
        decision: "command" as const,
        candidates: [],
      });
    }

    const { decision, candidates } = intent.query
      ? await matchCardName(intent.query, limit ?? 3)
      : { decision: "none" as const, candidates: [] };

    return ok({
      raw: intent.raw,
      command: null,
      quantity: intent.quantity,
      foil: intent.foil,
      query: intent.query,
      decision,
      candidates,
    });
  });
}
