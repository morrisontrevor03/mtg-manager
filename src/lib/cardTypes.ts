/**
 * Card-type helpers shared by the server aggregates and client views. Pure, so
 * it is safe to import from either side.
 */

/** Decklist order: the order types are conventionally listed in. */
export const TYPE_ORDER = [
  "Creature",
  "Planeswalker",
  "Battle",
  "Instant",
  "Sorcery",
  "Artifact",
  "Enchantment",
  "Land",
  "Other",
] as const;

export type PrimaryType = (typeof TYPE_ORDER)[number];

/**
 * The one type a card is filed under. Land wins (an artifact land is a land on
 * the curve), then creature (an artifact creature is a creature).
 */
export function primaryType(typeLine: string): PrimaryType {
  const t = typeLine.toLowerCase();
  for (const known of [
    "Land",
    "Creature",
    "Planeswalker",
    "Instant",
    "Sorcery",
    "Artifact",
    "Enchantment",
    "Battle",
  ] as const) {
    if (t.includes(known.toLowerCase())) return known;
  }
  return "Other";
}

const PLURAL: Record<PrimaryType, string> = {
  Creature: "Creatures",
  Planeswalker: "Planeswalkers",
  Battle: "Battles",
  Instant: "Instants",
  Sorcery: "Sorceries",
  Artifact: "Artifacts",
  Enchantment: "Enchantments",
  Land: "Lands",
  Other: "Other",
};

export const pluralType = (t: PrimaryType) => PLURAL[t];

/** Columns always shown on a mana curve, so gaps read as gaps. "0" is added only when used. */
export const CURVE_COLUMNS = ["1", "2", "3", "4", "5", "6", "7+"];

/** Mana-curve bucket for a mana value: "0" … "6", then "7+". */
export function curveBucket(cmc: number): string {
  const v = Math.max(0, Math.floor(cmc));
  return v >= 7 ? "7+" : String(v);
}
