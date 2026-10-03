import { describe, expect, it } from "vitest";
import { parseCardList } from "@/lib/csv";

describe("parseCardList", () => {
  it("parses a plain one-per-line list", () => {
    expect(parseCardList("Lightning Bolt\nCounterspell\nLlanowar Elves")).toEqual([
      { name: "Lightning Bolt", quantity: 1 },
      { name: "Counterspell", quantity: 1 },
      { name: "Llanowar Elves", quantity: 1 },
    ]);
  });

  it("skips a header row", () => {
    expect(parseCardList("Name\nLightning Bolt")).toEqual([
      { name: "Lightning Bolt", quantity: 1 },
    ]);
  });

  it("honours quantity prefixes", () => {
    expect(parseCardList("4 Lightning Bolt\n2x Opt\nx3 Shock")).toEqual([
      { name: "Lightning Bolt", quantity: 4 },
      { name: "Opt", quantity: 2 },
      { name: "Shock", quantity: 3 },
    ]);
  });

  it("collapses duplicates and sums quantities", () => {
    expect(parseCardList("Forest\n2 Forest\nforest")).toEqual([
      { name: "Forest", quantity: 4 },
    ]);
  });

  it("ignores blank lines and trims whitespace", () => {
    expect(parseCardList("\n  Island  \n\n\nPlains\n")).toEqual([
      { name: "Island", quantity: 1 },
      { name: "Plains", quantity: 1 },
    ]);
  });

  it("strips Arena-style trailing set decoration", () => {
    expect(parseCardList("1 Sheoldred, the Apocalypse (DMU) 107")).toEqual([
      { name: "Sheoldred, the Apocalypse", quantity: 1 },
    ]);
  });

  it("keeps commas inside quoted names", () => {
    expect(parseCardList('"Rankle, Master of Pranks"\nSol Ring')).toEqual([
      { name: "Rankle, Master of Pranks", quantity: 1 },
      { name: "Sol Ring", quantity: 1 },
    ]);
  });
});
