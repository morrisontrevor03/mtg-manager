import { getCommanderCandidates } from "@/lib/collection";
import { handle, ok } from "@/lib/http";

export const runtime = "nodejs";

export function GET() {
  return handle(async () => {
    const candidates = await getCommanderCandidates();

    // The deck-builder page used to read ANTHROPIC_API_KEY directly on the
    // server to decide whether to warn. A static client page cannot, so the
    // answer travels with the data instead — and it now reflects the deployed
    // state (ENABLE_DECK_BUILDER) rather than just whether a key is present.
    const deckBuilderEnabled =
      process.env.ENABLE_DECK_BUILDER === "true"
        ? Boolean(process.env.ANTHROPIC_API_KEY)
        : process.env.ENABLE_DECK_BUILDER === undefined &&
          Boolean(process.env.ANTHROPIC_API_KEY);

    return ok({
      deckBuilderEnabled,
      candidates: candidates.map((c) => ({
        cardId: c.cardId,
        name: c.name,
        colorIdentity: c.colorIdentity,
      })),
    });
  });
}
