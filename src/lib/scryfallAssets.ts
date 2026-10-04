/**
 * URLs for Scryfall's public card art and symbol assets.
 *
 * Kept free of React and DOM types so it can be unit tested. Everything here is
 * served from Scryfall's CDNs with `Access-Control-Allow-Origin: *`, which is
 * what lets set symbols be used as CSS masks (see `.set-symbol`).
 */

export type ImageVersion = "small" | "normal" | "large" | "art_crop" | "border_crop";

const VERSION_SEGMENT = /\/(small|normal|large|png|art_crop|border_crop)\//;

/**
 * The same printing's image in another size. We store the `normal` URL; rows
 * want the `art_crop` (artwork only) and previews want `normal` or `large`.
 */
export function cardImage(uri: string, version: ImageVersion): string {
  if (!uri || !VERSION_SEGMENT.test(uri)) return uri;
  return uri.replace(VERSION_SEGMENT, `/${version}/`).replace(/\.png(\?|$)/, ".jpg$1");
}

const SPECIAL_SYMBOLS: Record<string, string> = {
  "½": "HALF",
  "∞": "INFINITY",
};

/** `{W}`, `{2/U}`, `{G/P}` → Scryfall's SVG for that symbol. */
export function symbolUrl(symbol: string): string {
  const key = SPECIAL_SYMBOLS[symbol] ?? symbol.replace(/\//g, "").toUpperCase();
  return `https://svgs.scryfall.io/card-symbols/${encodeURIComponent(key)}.svg`;
}

/** Split a mana cost like `{2}{R}{R}` into its symbols. Faces are joined by `//`. */
export function parseManaCost(cost: string): string[] {
  return [...cost.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
}

/**
 * Best-guess set icon by code, used until the set catalogue has loaded. Promo
 * and token sets share their parent's icon, which only the catalogue knows.
 */
export function setIconFallback(code: string): string {
  return `https://svgs.scryfall.io/sets/${code.toLowerCase()}.svg`;
}

const RARITY_LABELS: Record<string, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  mythic: "Mythic rare",
  special: "Special",
  bonus: "Bonus",
};

export function rarityLabel(rarity: string): string {
  return RARITY_LABELS[rarity] ?? "Unknown rarity";
}
