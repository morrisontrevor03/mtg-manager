import { describe, expect, it } from "vitest";
import { parseVoiceInput } from "@/lib/voiceParse";

describe("parseVoiceInput — plain names", () => {
  it("passes a bare card name through", () => {
    const r = parseVoiceInput("Lightning Bolt");
    expect(r).toMatchObject({ command: null, quantity: 1, foil: false, query: "lightning bolt" });
    expect(r.raw).toBe("Lightning Bolt");
  });

  it("strips punctuation the recogniser inserts", () => {
    expect(parseVoiceInput("Krenko, Mob Boss.").query).toBe("krenko mob boss");
  });

  it("returns an empty intent for silence", () => {
    expect(parseVoiceInput("   ").query).toBe("");
  });
});

describe("parseVoiceInput — quantities", () => {
  it("reads digit quantities", () => {
    expect(parseVoiceInput("4 Lightning Bolt")).toMatchObject({
      quantity: 4,
      query: "lightning bolt",
    });
  });

  it("reads 4x style quantities", () => {
    expect(parseVoiceInput("4x Lightning Bolt")).toMatchObject({
      quantity: 4,
      query: "lightning bolt",
    });
  });

  it("reads word quantities", () => {
    expect(parseVoiceInput("four Lightning Bolt").quantity).toBe(4);
    expect(parseVoiceInput("seven Sol Ring").quantity).toBe(7);
    expect(parseVoiceInput("ten Mountain").quantity).toBe(10);
  });

  it("reads 'four times X'", () => {
    expect(parseVoiceInput("four times Lightning Bolt")).toMatchObject({
      quantity: 4,
      query: "lightning bolt",
    });
  });

  it("treats a mis-transcribed 'for' as four when a name follows", () => {
    expect(parseVoiceInput("for Lightning Bolt")).toMatchObject({
      quantity: 4,
      query: "lightning bolt",
    });
  });

  it("does NOT eat a leading number word when nothing follows", () => {
    // "Four" alone is not a quantity with no card attached.
    expect(parseVoiceInput("for")).toMatchObject({ quantity: 1 });
    expect(parseVoiceInput("a")).toMatchObject({ quantity: 1 });
  });

  it("keeps number words that belong to the card name", () => {
    // "one" here is the quantity, leaving the real name intact.
    expect(parseVoiceInput("one Sol Ring")).toMatchObject({ quantity: 1, query: "sol ring" });
  });

  it("caps absurd quantities", () => {
    expect(parseVoiceInput("999 Mountain").quantity).toBe(999);
  });
});

describe("parseVoiceInput — foil", () => {
  it("detects a leading foil", () => {
    expect(parseVoiceInput("foil Sol Ring")).toMatchObject({ foil: true, query: "sol ring" });
  });

  it("detects a trailing foil", () => {
    expect(parseVoiceInput("Sol Ring foil")).toMatchObject({ foil: true, query: "sol ring" });
  });

  it("combines quantity and foil", () => {
    expect(parseVoiceInput("two foil Lightning Bolt")).toMatchObject({
      quantity: 2,
      foil: true,
      query: "lightning bolt",
    });
  });

  it("defaults to non-foil", () => {
    expect(parseVoiceInput("Sol Ring").foil).toBe(false);
  });
});

describe("parseVoiceInput — commands", () => {
  it.each([
    ["undo", "undo"],
    ["scratch that", "undo"],
    ["stop", "stop"],
    ["done", "stop"],
    ["skip", "skip"],
    ["never mind", "skip"],
    ["yes", "yes"],
    ["no", "no"],
    ["one", "pick1"],
    ["number two", "pick2"],
    ["third", "pick3"],
  ])("recognises %s", (input, expected) => {
    expect(parseVoiceInput(input).command).toBe(expected);
  });

  it("only treats a command phrase as a command when it is the whole utterance", () => {
    // Otherwise these real card names would be swallowed as commands.
    expect(parseVoiceInput("Two-Headed Giant").command).toBeNull();
    expect(parseVoiceInput("No Mercy").command).toBeNull();
    expect(parseVoiceInput("One with Nothing").command).toBeNull();
  });

  it("ignores case and trailing punctuation", () => {
    expect(parseVoiceInput("Undo.").command).toBe("undo");
  });
});

describe("parseVoiceInput — unsearchable input", () => {
  it("blanks the query for stopword-only utterances", () => {
    // These must not be matched against the catalogue at all.
    expect(parseVoiceInput("the").query).toBe("");
    expect(parseVoiceInput("um uh").query).toBe("");
    expect(parseVoiceInput("and the").query).toBe("");
  });

  it("keeps a real name that merely contains stopwords", () => {
    expect(parseVoiceInput("Wrath of God").query).toBe("wrath of god");
  });
});
