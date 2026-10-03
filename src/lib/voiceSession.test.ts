import { describe, expect, it } from "vitest";
import { shouldAutoDismiss, type DismissableEntry, type EntryStatus } from "@/lib/voiceSession";

const entry = (over: Partial<DismissableEntry> = {}): DismissableEntry => ({
  id: "old",
  status: "unresolved",
  ...over,
});

const TRIGGER = "new";

describe("shouldAutoDismiss", () => {
  it("clears an earlier unmatched utterance once a later one succeeds", () => {
    // The whole point: mumbles and background noise clean themselves up.
    expect(shouldAutoDismiss(entry(), TRIGGER)).toBe(true);
  });

  it("clears several stale misses at once", () => {
    const stale = [entry({ id: "a" }), entry({ id: "b" }), entry({ id: "c" })];
    expect(stale.every((e) => shouldAutoDismiss(e, TRIGGER))).toBe(true);
  });

  it("never clears the utterance that just succeeded", () => {
    expect(shouldAutoDismiss(entry({ id: TRIGGER }), TRIGGER)).toBe(false);
  });

  it("keeps a correction the user has started typing", () => {
    // Clearing this would throw away their work mid-keystroke.
    expect(shouldAutoDismiss(entry({ editing: true }), TRIGGER)).toBe(false);
  });

  it("keeps hard errors, which are a real problem rather than mis-heard audio", () => {
    expect(shouldAutoDismiss(entry({ status: "error" }), TRIGGER)).toBe(false);
  });

  it("does not re-dismiss something already on its way out", () => {
    expect(shouldAutoDismiss(entry({ dismissing: true }), TRIGGER)).toBe(false);
  });

  it("leaves every other stage alone", () => {
    const untouched: EntryStatus[] = [
      "heard",
      "matched",
      "enriching",
      "enriched",
      "confirming",
    ];
    for (const status of untouched) {
      expect(shouldAutoDismiss(entry({ status }), TRIGGER)).toBe(false);
    }
  });
});
