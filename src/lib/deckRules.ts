import type { Color, Format, Legalities } from "@/lib/types";

export type DeckRole = "commander" | "mainboard" | "sideboard";

export interface RuleCard {
  name: string;
  quantity: number;
  role: DeckRole;
  typeLine: string;
  oracleText: string;
  colorIdentity: Color[];
  legalities: Legalities;
}

export interface ValidationResult {
  ok: boolean;
  violations: string[];
}

const BASIC_LANDS = new Set([
  "plains",
  "island",
  "swamp",
  "mountain",
  "forest",
  "wastes",
  "snow-covered plains",
  "snow-covered island",
  "snow-covered swamp",
  "snow-covered mountain",
  "snow-covered forest",
  "snow-covered wastes",
]);

export function isBasicLand(name: string): boolean {
  return BASIC_LANDS.has(name.trim().toLowerCase());
}

/** Cards whose oracle text lets a deck run any number of copies. */
function allowsAnyNumber(card: RuleCard): boolean {
  return /a deck can have any number of cards named/i.test(card.oracleText);
}

function canBeCommander(card: RuleCard): boolean {
  const t = card.typeLine.toLowerCase();
  if (t.includes("legendary") && t.includes("creature")) return true;
  return /can be your commander/i.test(card.oracleText);
}

/** Is `identity` a subset of `commander`'s colour identity? */
function withinIdentity(identity: Color[], commander: Color[]): boolean {
  const allowed = new Set(commander);
  return identity.every((c) => allowed.has(c));
}

export interface ValidateOptions {
  /**
   * Colours the player asked for. Every card's colour identity must fall
   * within them. Omit (or pass an empty list) for no restriction.
   */
  colors?: Color[];
}

export function validateDeck(
  format: Format,
  cards: RuleCard[],
  opts: ValidateOptions = {},
): ValidationResult {
  const base = format === "commander" ? validateCommander(cards) : validateStandard(cards);
  if (!opts.colors?.length) return base;

  const allowed = opts.colors;
  const offColor = cards
    .filter((c) => !withinIdentity(c.colorIdentity, allowed))
    .map((c) => `${c.name} falls outside the requested colours (${allowed.join("")}).`);
  const violations = dedupe([...base.violations, ...offColor]);
  return { ok: violations.length === 0, violations };
}

function validateStandard(cards: RuleCard[]): ValidationResult {
  const violations: string[] = [];
  const main = cards.filter((c) => c.role === "mainboard");
  const side = cards.filter((c) => c.role === "sideboard");

  const mainCount = sum(main);
  const sideCount = sum(side);

  if (cards.some((c) => c.role === "commander")) {
    violations.push("Standard decks do not have a commander.");
  }
  if (mainCount < 60) {
    violations.push(`Main deck has ${mainCount} cards; Standard requires at least 60.`);
  }
  if (sideCount > 15) {
    violations.push(`Sideboard has ${sideCount} cards; the maximum is 15.`);
  }

  // Copy limits are across main + sideboard combined.
  const totals = new Map<string, { qty: number; card: RuleCard }>();
  for (const c of [...main, ...side]) {
    const key = c.name.toLowerCase();
    const entry = totals.get(key);
    if (entry) entry.qty += c.quantity;
    else totals.set(key, { qty: c.quantity, card: c });
  }
  for (const { qty, card } of totals.values()) {
    if (qty > 4 && !isBasicLand(card.name) && !allowsAnyNumber(card)) {
      violations.push(`${card.name}: ${qty} copies (max 4).`);
    }
    if (legalityFor(card, "standard") !== "legal") {
      violations.push(`${card.name} is not legal in Standard.`);
    }
  }

  return { ok: violations.length === 0, violations };
}

function validateCommander(cards: RuleCard[]): ValidationResult {
  const violations: string[] = [];
  const commanders = cards.filter((c) => c.role === "commander");
  const main = cards.filter((c) => c.role === "mainboard");

  if (commanders.length !== 1) {
    violations.push(`Expected exactly 1 commander, found ${commanders.length}.`);
  }
  const commander = commanders[0];
  if (commander && !canBeCommander(commander)) {
    violations.push(`${commander.name} cannot be a commander (not a legendary creature).`);
  }

  const total = sum(commanders) + sum(main);
  if (total !== 100) {
    violations.push(`Deck has ${total} cards; Commander requires exactly 100 (including the commander).`);
  }

  const identity = commander?.colorIdentity ?? [];

  const seen = new Map<string, number>();
  for (const c of [...commanders, ...main]) {
    const key = c.name.toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + c.quantity);

    if (!isBasicLand(c.name) && !allowsAnyNumber(c) && (seen.get(key) ?? 0) > 1) {
      violations.push(`${c.name}: singleton format allows only 1 copy.`);
    }
    if (!withinIdentity(c.colorIdentity, identity)) {
      violations.push(`${c.name} falls outside the commander's colour identity.`);
    }
    if (legalityFor(c, "commander") !== "legal") {
      violations.push(`${c.name} is not legal in Commander.`);
    }
  }

  return { ok: violations.length === 0, violations: dedupe(violations) };
}

function sum(cards: RuleCard[]): number {
  return cards.reduce((n, c) => n + c.quantity, 0);
}

function legalityFor(card: RuleCard, fmt: string): string {
  return card.legalities?.[fmt] ?? "not_legal";
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}
