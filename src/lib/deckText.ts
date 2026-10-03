import type { SerializedDeck } from "@/lib/deck";

/**
 * Plain-text decklist for copy/paste into Arena, Moxfield, etc.
 *
 * This lives apart from `deck.ts` because the deck page is a client component
 * now: `deck.ts` imports the Prisma client at module scope, and importing
 * anything from it would drag PrismaClient into the browser bundle. The type
 * import above is erased at compile time, so nothing follows it at runtime.
 */
export function toDeckText(deck: SerializedDeck): string {
  const lines: string[] = [];
  if (deck.groups.commander.length) {
    lines.push("Commander");
    for (const c of deck.groups.commander) lines.push(`${c.quantity} ${c.name}`);
    lines.push("");
  }
  lines.push("Deck");
  for (const c of deck.groups.mainboard) lines.push(`${c.quantity} ${c.name}`);
  if (deck.groups.sideboard.length) {
    lines.push("", "Sideboard");
    for (const c of deck.groups.sideboard) lines.push(`${c.quantity} ${c.name}`);
  }
  return lines.join("\n");
}
