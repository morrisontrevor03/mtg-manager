import { z } from "zod";
import { WUBRG, type Color } from "@/lib/types";

/**
 * Deck-builder parameters, shared by the form and the API so the two cannot
 * disagree about what a valid request is. Free of server imports: the static
 * frontend bundles this file.
 */

export const ARCHETYPES = [
  { value: "aggro", label: "Aggro", brief: "cheap threats, a low curve, and reach to close the game fast" },
  { value: "midrange", label: "Midrange", brief: "efficient threats backed by removal, winning the long game on card quality" },
  { value: "control", label: "Control", brief: "counterspells, removal and card advantage, with a few resilient finishers" },
  { value: "tempo", label: "Tempo", brief: "cheap evasive threats protected by interaction that costs less than the opponent's plays" },
  { value: "combo", label: "Combo", brief: "a small number of cards that win together, plus tutors and protection to assemble them" },
  { value: "ramp", label: "Ramp", brief: "mana acceleration into large, game-ending spells" },
  { value: "tokens", label: "Tokens", brief: "wide boards of creature tokens and anthem or sacrifice payoffs" },
  { value: "tribal", label: "Tribal", brief: "one creature type with lords and type-matters payoffs" },
  { value: "spellslinger", label: "Spellslinger", brief: "instants and sorceries with payoffs that trigger on casting them" },
  { value: "aristocrats", label: "Aristocrats", brief: "sacrifice outlets, fodder, and drain payoffs that trigger when creatures die" },
  { value: "reanimator", label: "Reanimator", brief: "filling the graveyard and returning large creatures from it cheaply" },
  { value: "voltron", label: "Voltron", brief: "one evasive threat (usually the commander) loaded with equipment and auras" },
] as const;

export type Archetype = (typeof ARCHETYPES)[number]["value"];

const archetypeValues = ARCHETYPES.map((a) => a.value) as [Archetype, ...Archetype[]];

export const BuildParamsSchema = z
  .object({
    format: z.enum(["standard", "commander"]),
    /** Free-text guidance. Optional once something else describes the deck. */
    prompt: z.string().trim().max(2000).default(""),
    commanderName: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((v) => v || undefined),
    /** Colours the deck may use. Empty means the model chooses. */
    colors: z
      .array(z.enum(WUBRG as [Color, ...Color[]]))
      .max(5)
      .default([])
      .transform((cs) => WUBRG.filter((c) => cs.includes(c))),
    archetype: z.enum(archetypeValues).optional(),
    allowAcquire: z.boolean().default(true),
    budgetUsd: z.number().positive().max(100000).optional(),
  })
  .transform((p) => ({
    ...p,
    // A commander fixes the colour identity, so picked colours would only
    // contradict it; standard decks have no commander.
    colors: p.format === "commander" && p.commanderName ? [] : p.colors,
    commanderName: p.format === "commander" ? p.commanderName : undefined,
    budgetUsd: p.allowAcquire ? p.budgetUsd : undefined,
  }))
  .refine(
    (p) => p.prompt.length >= 3 || p.archetype || p.colors.length > 0 || p.commanderName,
    {
      message: "Describe the deck, or pick an archetype, colours or a commander.",
      path: ["prompt"],
    },
  );

export type BuildParams = z.output<typeof BuildParamsSchema>;
export type BuildParamsInput = z.input<typeof BuildParamsSchema>;

export function archetypeBrief(a: Archetype): string {
  const found = ARCHETYPES.find((x) => x.value === a);
  return found ? `${found.label}: ${found.brief}` : a;
}
