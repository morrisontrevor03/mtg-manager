import { describe, expect, it } from "vitest";
import { BuildParamsSchema } from "@/lib/deckParams";

const parse = (input: unknown) => BuildParamsSchema.safeParse(input);

describe("BuildParamsSchema", () => {
  it("accepts a prompt on its own", () => {
    const res = parse({ format: "standard", prompt: "Mono-red burn" });
    expect(res.success && res.data).toMatchObject({
      prompt: "Mono-red burn",
      colors: [],
      allowAcquire: true,
    });
  });

  it("accepts an archetype or colours in place of a prompt", () => {
    expect(parse({ format: "standard", archetype: "control" }).success).toBe(true);
    expect(parse({ format: "standard", colors: ["U"] }).success).toBe(true);
    expect(parse({ format: "commander", commanderName: "Krenko, Mob Boss" }).success).toBe(true);
  });

  it("rejects a request with nothing to go on", () => {
    const res = parse({ format: "commander", prompt: "  " });
    expect(res.success).toBe(false);
  });

  it("puts colours in WUBRG order and drops duplicates", () => {
    const res = parse({ format: "standard", colors: ["G", "W", "G"] });
    expect(res.success && res.data.colors).toEqual(["W", "G"]);
  });

  it("drops colours when a commander fixes them", () => {
    const res = parse({ format: "commander", commanderName: "Krenko, Mob Boss", colors: ["U"] });
    expect(res.success && res.data.colors).toEqual([]);
  });

  it("drops a commander from a standard request", () => {
    const res = parse({ format: "standard", prompt: "Burn", commanderName: "Krenko, Mob Boss" });
    expect(res.success && res.data.commanderName).toBeUndefined();
  });

  it("ignores the budget when acquisitions are off", () => {
    const res = parse({ format: "standard", prompt: "Burn", allowAcquire: false, budgetUsd: 50 });
    expect(res.success && res.data.budgetUsd).toBeUndefined();
  });

  it("rejects an unknown archetype or colour", () => {
    expect(parse({ format: "standard", archetype: "stompy" }).success).toBe(false);
    expect(parse({ format: "standard", colors: ["X"] }).success).toBe(false);
  });

  it("is idempotent, so a stored job can be parsed again", () => {
    const first = BuildParamsSchema.parse({
      format: "commander",
      prompt: " Goblins ",
      colors: ["R", "B"],
      archetype: "tokens",
      budgetUsd: 40,
    });
    expect(BuildParamsSchema.parse(JSON.parse(JSON.stringify(first)))).toEqual(first);
  });
});
