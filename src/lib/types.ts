export type Format = "standard" | "commander";

export type Color = "W" | "U" | "B" | "R" | "G";

export const COLOR_NAMES: Record<Color, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
};

export const WUBRG: Color[] = ["W", "U", "B", "R", "G"];

/** Shape of the JSON columns on the Card model. */
export interface CardPrices {
  usd?: string | null;
  usd_foil?: string | null;
  eur?: string | null;
  tix?: string | null;
}

export type Legality = "legal" | "not_legal" | "banned" | "restricted";
export type Legalities = Record<string, Legality>;

/** A collection entry joined with its card, as used across the UI. */
export interface OwnedCard {
  cardId: string;
  name: string;
  quantity: number;
  foil: boolean;
  typeLine: string;
  manaCost: string;
  cmc: number;
  colors: Color[];
  colorIdentity: Color[];
  rarity: string;
  oracleText: string;
  legalities: Legalities;
  priceUsd: number;
  imageUri: string;
}
