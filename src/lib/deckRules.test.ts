import { describe, expect, it } from "vitest";
import { validateDeck, type RuleCard } from "@/lib/deckRules";
import type { Color } from "@/lib/types";

function card(partial: Partial<RuleCard> & { name: string }): RuleCard {
  return {
    quantity: 1,
    role: "mainboard",
    typeLine: "Creature",
    oracleText: "",
    colorIdentity: [],
    legalities: { standard: "legal", commander: "legal" },
    ...partial,
  };
}

function basics(name: string, qty: number, ci: Color[] = []): RuleCard {
  return card({ name, quantity: qty, typeLine: "Basic Land", colorIdentity: ci });
}

describe("validateDeck — standard", () => {
  it("accepts a legal 60-card deck", () => {
    const cards = [
      card({ name: "Mountain", quantity: 28, typeLine: "Basic Land" }),
      card({ name: "Lightning Strike", quantity: 4 }),
      card({ name: "Monastery Swiftspear", quantity: 4 }),
      card({ name: "Play with Fire", quantity: 4 }),
      card({ name: "Kumano Faces Kakkazan", quantity: 4 }),
      card({ name: "Feldon, Ronom Excavator", quantity: 4 }),
      card({ name: "Bloodthirsty Adversary", quantity: 4 }),
      card({ name: "Squee, Dubious Monarch", quantity: 4 }),
      card({ name: "Rampaging Raptor", quantity: 4 }),
    ];
    expect(validateDeck("standard", cards)).toEqual({ ok: true, violations: [] });
  });

  it("flags fewer than 60 cards", () => {
    const res = validateDeck("standard", [card({ name: "Mountain", quantity: 40, typeLine: "Basic Land" })]);
    expect(res.ok).toBe(false);
    expect(res.violations.join(" ")).toMatch(/at least 60/);
  });

  it("flags more than 4 copies of a nonbasic", () => {
    const cards = [
      card({ name: "Mountain", quantity: 55, typeLine: "Basic Land" }),
      card({ name: "Lightning Bolt", quantity: 5 }),
    ];
    const res = validateDeck("standard", cards);
    expect(res.ok).toBe(false);
    expect(res.violations.join(" ")).toMatch(/Lightning Bolt: 5 copies/);
  });

  it("allows any number of a card whose text says so", () => {
    const cards = [
      card({ name: "Mountain", quantity: 20, typeLine: "Basic Land" }),
      card({
        name: "Dragon's Approach",
        quantity: 40,
        oracleText: "A deck can have any number of cards named Dragon's Approach.",
      }),
    ];
    expect(validateDeck("standard", cards).ok).toBe(true);
  });

  it("flags a card not legal in standard", () => {
    const cards = [
      card({ name: "Mountain", quantity: 56, typeLine: "Basic Land" }),
      card({ name: "Sol Ring", quantity: 4, legalities: { standard: "not_legal", commander: "legal" } }),
    ];
    const res = validateDeck("standard", cards);
    expect(res.ok).toBe(false);
    expect(res.violations.join(" ")).toMatch(/Sol Ring is not legal in Standard/);
  });

  it("rejects a commander in a standard deck", () => {
    const cards = [
      card({ name: "Mountain", quantity: 60, typeLine: "Basic Land" }),
      card({ name: "Krenko, Mob Boss", role: "commander", typeLine: "Legendary Creature — Goblin" }),
    ];
    expect(validateDeck("standard", cards).ok).toBe(false);
  });
});

describe("validateDeck — commander", () => {
  function commanderDeck(overrides: {
    commander?: Partial<RuleCard>;
    fillCount?: number;
    extra?: RuleCard[];
  } = {}): RuleCard[] {
    const commander = card({
      name: "Krenko, Mob Boss",
      role: "commander",
      typeLine: "Legendary Creature — Goblin",
      colorIdentity: ["R"],
      ...overrides.commander,
    });
    const fill = overrides.fillCount ?? 99;
    const rest: RuleCard[] = [];
    for (let i = 0; i < fill; i++) {
      rest.push(card({ name: `Filler ${i}`, colorIdentity: ["R"] }));
    }
    return [commander, ...rest, ...(overrides.extra ?? [])];
  }

  it("accepts a legal 100-card singleton deck", () => {
    expect(validateDeck("commander", commanderDeck())).toEqual({ ok: true, violations: [] });
  });

  it("flags a deck that is not exactly 100", () => {
    const res = validateDeck("commander", commanderDeck({ fillCount: 90 }));
    expect(res.ok).toBe(false);
    expect(res.violations.join(" ")).toMatch(/exactly 100/);
  });

  it("flags duplicate nonbasic cards", () => {
    const res = validateDeck("commander", [
      ...commanderDeck({ fillCount: 97 }),
      card({ name: "Sol Ring", colorIdentity: [] }),
      card({ name: "Sol Ring", colorIdentity: [] }),
    ]);
    expect(res.ok).toBe(false);
    expect(res.violations.join(" ")).toMatch(/Sol Ring: singleton/);
  });

  it("permits multiple basic lands", () => {
    const res = validateDeck("commander", [
      ...commanderDeck({ fillCount: 69 }),
      basics("Mountain", 30, []),
    ]);
    expect(res.ok).toBe(true);
  });

  it("flags a card outside the commander's colour identity", () => {
    const res = validateDeck("commander", [
      ...commanderDeck({ fillCount: 98 }),
      card({ name: "Counterspell", colorIdentity: ["U"] }),
    ]);
    expect(res.ok).toBe(false);
    expect(res.violations.join(" ")).toMatch(/colour identity/);
  });

  it("flags a non-legendary commander", () => {
    const res = validateDeck("commander", commanderDeck({ commander: { typeLine: "Creature — Goblin" } }));
    expect(res.ok).toBe(false);
    expect(res.violations.join(" ")).toMatch(/cannot be a commander/);
  });
});

describe("validateDeck — requested colours", () => {
  const redDeck = [
    basics("Mountain", 28, ["R"]),
    ...["A", "B", "C", "D", "E", "F", "G", "H"].map((n) =>
      card({ name: `Red ${n}`, quantity: 4, colorIdentity: ["R"] }),
    ),
  ];

  it("accepts a deck inside the requested colours", () => {
    expect(validateDeck("standard", redDeck, { colors: ["R", "G"] })).toEqual({
      ok: true,
      violations: [],
    });
  });

  it("flags a card outside the requested colours", () => {
    const res = validateDeck(
      "standard",
      [...redDeck.slice(0, -1), card({ name: "Opt", quantity: 4, colorIdentity: ["U"] })],
      { colors: ["R"] },
    );
    expect(res.ok).toBe(false);
    expect(res.violations).toEqual(["Opt falls outside the requested colours (R)."]);
  });

  it("treats colourless cards as fitting any colours", () => {
    const res = validateDeck(
      "standard",
      [...redDeck.slice(0, -1), card({ name: "Some Artifact", quantity: 4 })],
      { colors: ["R"] },
    );
    expect(res.ok).toBe(true);
  });

  it("applies no restriction for an empty list", () => {
    const res = validateDeck(
      "standard",
      [...redDeck.slice(0, -1), card({ name: "Opt", quantity: 4, colorIdentity: ["U"] })],
      { colors: [] },
    );
    expect(res.ok).toBe(true);
  });
});
