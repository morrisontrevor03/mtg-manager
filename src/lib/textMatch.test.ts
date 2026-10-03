import { describe, expect, it } from "vitest";
import {
  buildForms,
  editSimilarity,
  levenshtein,
  normalize,
  scoreCandidate,
  squash,
} from "@/lib/textMatch";

/** Score a spoken query against a candidate name, the way cardIndex does. */
function score(query: string, candidate: string): number {
  const q = buildForms(query);
  return scoreCandidate(q, new Set(q.tokens), new Set(q.squashedTokens), buildForms(candidate));
}

describe("normalize", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalize("Krenko, Mob Boss")).toBe("krenko mob boss");
    expect(normalize("Urza's Saga")).toBe("urza s saga");
  });

  it("folds diacritics to plain ascii", () => {
    expect(normalize("Adãwalé, Breaker of Chains")).toBe("adawale breaker of chains");
    expect(normalize("Andúril, Flame of the West")).toBe("anduril flame of the west");
  });

  it("splits double-faced names on the //", () => {
    expect(normalize("Shatterskull Smashing // Shatterskull, the Hammer Pass")).toBe(
      "shatterskull smashing shatterskull the hammer pass",
    );
  });

  it("collapses whitespace and trims", () => {
    expect(normalize("  Sol   Ring \n")).toBe("sol ring");
  });
});

describe("squash", () => {
  it("collapses homophone spellings to the same key", () => {
    expect(squash("fone")).toBe(squash("phone"));
    expect(squash("kat")).toBe(squash("cat"));
  });

  it("collapses doubled letters", () => {
    expect(squash("llanowar")).toBe(squash("lanowar"));
  });

  it("keeps the leading character", () => {
    expect(squash("elves").startsWith("e")).toBe(true);
  });

  it("handles an empty token", () => {
    expect(squash("")).toBe("");
  });
});

describe("levenshtein / editSimilarity", () => {
  it("measures edit distance", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("same", "same")).toBe(0);
    expect(levenshtein("", "abc")).toBe(3);
  });

  it("reports 1 for identical strings and 0 for disjoint ones", () => {
    expect(editSimilarity("bolt", "bolt")).toBe(1);
    expect(editSimilarity("abc", "xyz")).toBe(0);
  });
});

describe("scoreCandidate short-circuits", () => {
  it("scores an exact normalized match 1.0", () => {
    expect(score("lightning bolt", "Lightning Bolt")).toBe(1);
    // Punctuation in the real name must not cost anything.
    expect(score("krenko mob boss", "Krenko, Mob Boss")).toBe(1);
  });

  it("scores a space-stripped match 0.97 — the compound-split case", () => {
    expect(score("counter spell", "Counterspell")).toBeCloseTo(0.97);
    expect(score("thought seize", "Thoughtseize")).toBeCloseTo(0.97);
    expect(score("solring", "Sol Ring")).toBeCloseTo(0.97);
  });

  it("scores a phonetic whole-name match 0.93", () => {
    expect(score("lano war elves", "Llanowar Elves")).toBeCloseTo(0.93);
  });

  it("never exceeds 0.92 for a merely-similar name", () => {
    expect(score("smothering tights", "Smothering Tithe")).toBeLessThanOrEqual(0.92);
  });
});

describe("scoreCandidate ranking", () => {
  const beats = (query: string, winner: string, loser: string) =>
    expect(score(query, winner)).toBeGreaterThan(score(query, loser));

  it("prefers the compound word over a token-reordered decoy", () => {
    // Regression: with token overlap weighted too heavily, "Spell Counter"
    // (both tokens present) outscored the correct "Counterspell".
    beats("counter spell", "Counterspell", "Spell Counter");
    beats("thought seize", "Thoughtseize", "Thought Vessel");
  });

  it("picks the right card through homophone substitution", () => {
    beats("shell dread the apocalypse", "Sheoldred, the Apocalypse", "Shelldock Isle");
    beats("risstic study", "Rhystic Study", "Mystic Study");
    beats("smothering tights", "Smothering Tithe", "Smothering Abomination");
  });

  it("tolerates a mangled tail", () => {
    beats("ragavan nimble pill fur", "Ragavan, Nimble Pilferer", "Nimble Obstructionist");
  });

  it("separates real matches from garbage by a wide margin", () => {
    // Measured against the full catalogue: real >= 0.71, garbage <= 0.42.
    expect(score("sword to plowshare", "Swords to Plowshares")).toBeGreaterThan(0.62);
    expect(score("um let me think", "Lightning Bolt")).toBeLessThan(0.62);
    expect(score("next card please", "Counterspell")).toBeLessThan(0.62);
  });
});
