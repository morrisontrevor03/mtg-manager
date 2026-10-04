import { describe, expect, it } from "vitest";
import { timeAgo } from "./timeAgo";
import { cardImage, parseManaCost, symbolUrl } from "./scryfallAssets";

const now = new Date(2026, 9, 3, 15, 0, 0); // 3 Oct 2026, 15:00 local

const ago = (ms: number) => new Date(now.getTime() - ms);

describe("timeAgo", () => {
  it("reads as just now under a minute", () => {
    expect(timeAgo(ago(20_000), now)).toBe("just now");
  });

  it("counts minutes and hours", () => {
    expect(timeAgo(ago(2 * 60_000), now)).toBe("2 min ago");
    expect(timeAgo(ago(3 * 3_600_000), now)).toBe("3 h ago");
  });

  it("uses calendar days, not 24-hour blocks", () => {
    expect(timeAgo(ago(26 * 3_600_000), now)).toBe("yesterday");
    expect(timeAgo(new Date(2026, 8, 29, 12), now)).toBe("4 days ago");
  });

  it("falls back to a date after a week", () => {
    expect(timeAgo(new Date(2026, 7, 1), now)).not.toMatch(/ago/);
  });
});

describe("scryfall assets", () => {
  it("swaps image versions on Scryfall URLs", () => {
    const normal = "https://cards.scryfall.io/normal/front/a/b/abc.jpg?1700000000";
    expect(cardImage(normal, "art_crop")).toBe(
      "https://cards.scryfall.io/art_crop/front/a/b/abc.jpg?1700000000",
    );
    expect(cardImage("", "small")).toBe("");
  });

  it("maps hybrid, phyrexian and generic symbols to file names", () => {
    expect(symbolUrl("W/U")).toMatch(/\/WU\.svg$/);
    expect(symbolUrl("2/W")).toMatch(/\/2W\.svg$/);
    expect(symbolUrl("G/P")).toMatch(/\/GP\.svg$/);
    expect(symbolUrl("10")).toMatch(/\/10\.svg$/);
  });

  it("splits a mana cost into symbols", () => {
    expect(parseManaCost("{2}{R}{R}")).toEqual(["2", "R", "R"]);
    expect(parseManaCost("")).toEqual([]);
  });
});
