import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Format } from "@/lib/types";
import type { OwnedCard } from "@/lib/types";

export const DECK_BUILDER_MODEL = "claude-opus-5";

const DraftCardSchema = z.object({
  name: z.string().describe("Exact card name as printed."),
  quantity: z.number().int().positive(),
  role: z.enum(["commander", "mainboard", "sideboard"]),
  owned: z.boolean().describe("True only if present in the supplied collection with enough copies."),
  acquire: z.boolean().describe("True if the player needs to acquire this card."),
});

const DeckDraftSchema = z.object({
  deckName: z.string(),
  strategy: z.string().describe("One or two sentences on the deck's game plan."),
  cards: z.array(DraftCardSchema),
  manaBaseNotes: z.string().describe("Short guidance on the mana base / land count."),
  rationale: z
    .string()
    .describe("A few paragraphs explaining key card choices, synergies, and any acquisitions."),
});

export type DeckDraft = z.infer<typeof DeckDraftSchema>;

export interface BuildDeckInput {
  format: Format;
  prompt: string;
  ownedCards: OwnedCard[];
  commanderName?: string;
  allowAcquire: boolean;
  budgetUsd?: number;
  /** Violations from a previous validation pass, to drive a single retry. */
  retryViolations?: string[];
  previousDraft?: DeckDraft;
}

class MissingApiKeyError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set. Add it to .env to use the deck builder.");
    this.name = "MissingApiKeyError";
  }
}
export { MissingApiKeyError };

function rulesBlock(format: Format): string {
  if (format === "commander") {
    return [
      "FORMAT: Commander (EDH).",
      "- Exactly 100 cards total, including the commander.",
      "- Singleton: at most one copy of any card except basic lands.",
      "- The commander must be a legendary creature (or a card that says it can be your commander).",
      "- Every card's colour identity must be a subset of the commander's colour identity.",
      "- Use role \"commander\" for the commander, \"mainboard\" for the other 99. No sideboard.",
      "- Aim for ~36-38 lands plus ramp.",
    ].join("\n");
  }
  return [
    "FORMAT: Standard.",
    "- Exactly 60 cards in the mainboard (do not go over unless you have a strong reason).",
    "- At most 4 copies of any card except basic lands.",
    "- Optional sideboard of up to 15 cards (role \"sideboard\").",
    "- Every card must currently be Standard-legal.",
    "- Aim for ~24-26 lands for most decks.",
  ].join("\n");
}

function collectionTable(cards: OwnedCard[]): string {
  if (cards.length === 0) return "(the collection has no format-legal cards)";
  return cards
    .map((c) => {
      const ci = c.colorIdentity.join("") || "C";
      return `${c.quantity}x ${c.name} | ${c.typeLine} | ${c.manaCost || "—"} | CI:${ci}`;
    })
    .join("\n");
}

function buildSystemPrompt(input: BuildDeckInput): string {
  const parts: string[] = [
    "You are an expert Magic: The Gathering deck builder.",
    rulesBlock(input.format),
    "",
    "CARD POOL RULES:",
    "- Strongly prefer cards from the player's collection below.",
    input.allowAcquire
      ? "- You MAY add a small number of cards the player does not own; mark each with acquire=true and owned=false."
      : "- You MUST build entirely from the collection below. Never set acquire=true.",
  ];
  if (input.allowAcquire) {
    parts.push(
      input.budgetUsd != null
        ? `- Keep the total price of acquired cards under about $${input.budgetUsd}.`
        : "- Keep acquisitions minimal (ideally under 10 cards).",
    );
  }
  parts.push(
    "- Set owned=true ONLY for cards that appear in the collection list with enough copies for the quantity you use.",
    "",
    "OUTPUT: Return the deck via the structured format. Card names must be exact and real.",
    "",
    "PLAYER'S COLLECTION (format-legal cards only):",
    collectionTable(input.ownedCards),
  );
  return parts.join("\n");
}

function buildUserPrompt(input: BuildDeckInput): string {
  const parts: string[] = [`Build me a ${input.format} deck. Request: ${input.prompt}`];
  if (input.commanderName) {
    parts.push(`Use "${input.commanderName}" as the commander.`);
  }
  if (input.retryViolations?.length) {
    parts.push(
      "",
      "Your previous attempt broke these rules — fix all of them and return a corrected list:",
      ...input.retryViolations.map((v) => `- ${v}`),
    );
    if (input.previousDraft) {
      parts.push("", "Previous attempt:", JSON.stringify(input.previousDraft.cards));
    }
  }
  return parts.join("\n");
}

/**
 * Ask Claude to build a deck. Returns the raw draft; the caller is responsible
 * for validating it against deck rules and reconciling ownership.
 *
 * To harden against safety refusals you could switch to
 * `client.beta.messages.parse` with `betas: ["server-side-fallback-2026-07-01"]`
 * and `fallbacks: "default"`; deck-building prompts rarely trigger them.
 */
export async function buildDeckDraft(input: BuildDeckInput): Promise<DeckDraft> {
  if (!process.env.ANTHROPIC_API_KEY) throw new MissingApiKeyError();

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: DECK_BUILDER_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: [
      {
        type: "text",
        text: buildSystemPrompt(input),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: buildUserPrompt(input) }],
    output_config: { format: zodOutputFormat(DeckDraftSchema) },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined this deck-building request.");
  }
  const draft = response.parsed_output;
  if (!draft) throw new Error("The model did not return a valid deck.");
  return draft;
}
