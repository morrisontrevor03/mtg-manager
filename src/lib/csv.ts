export interface ParsedLine {
  name: string;
  quantity: number;
}

const HEADER_WORDS = new Set(["name", "card", "card name", "cardname", "cards"]);

// "2 ", "2x ", "2X ", "x2 " prefixes.
const QTY_PREFIX = /^\s*(?:x\s*(\d+)|(\d+)\s*x?)\s+(.+)$/i;
// Trailing Arena/Moxfield decoration: " (SET) 123", " [SET]", " #123", " *F*".
const TRAILING_DECOR = /\s*(?:\([^)]*\)\s*[\dA-Za-z-]*|\[[^\]]*\]|#\S+|\*[^*]+\*)\s*$/;

/**
 * Parse a single-column list of card names (pasted text or an uploaded CSV).
 *
 * Each line is treated as one whole value — card names often contain commas
 * (e.g. "Rankle, Master of Pranks"), so we deliberately do not split on them.
 * Tolerates a header row, `2x` / `2 ` quantity prefixes, surrounding quotes,
 * and Arena-style trailing set codes. Repeated names are summed.
 */
export function parseCardList(input: string): ParsedLine[] {
  const lines = input.replace(/^﻿/, "").split(/\r?\n/);

  const counts = new Map<string, number>();
  const order: string[] = [];
  let seenFirst = false;

  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line) continue;

    // Unwrap a fully quoted line.
    if (line.length >= 2 && line.startsWith('"') && line.endsWith('"')) {
      line = line.slice(1, -1).replace(/""/g, '"').trim();
    }
    if (!line) continue;

    if (!seenFirst) {
      seenFirst = true;
      if (HEADER_WORDS.has(line.toLowerCase())) continue;
    }

    let quantity = 1;
    let name = line;

    const m = QTY_PREFIX.exec(name);
    if (m) {
      quantity = Math.max(1, parseInt(m[1] ?? m[2], 10) || 1);
      name = m[3].trim();
    }

    name = name.replace(TRAILING_DECOR, "").trim();
    if (!name) continue;

    const key = name.toLowerCase();
    if (!counts.has(key)) order.push(name);
    counts.set(key, (counts.get(key) ?? 0) + quantity);
  }

  return order.map((name) => ({ name, quantity: counts.get(name.toLowerCase()) ?? 1 }));
}
