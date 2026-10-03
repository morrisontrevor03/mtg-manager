/**
 * Rules for the transient state of a voice-entry session.
 *
 * Kept separate from the component so the carve-outs below are explicit and
 * unit tested rather than buried in a render tree.
 */

export type EntryStatus =
  | "heard"
  | "matched"
  | "enriching"
  | "enriched"
  | "confirming"
  | "unresolved"
  | "error";

export interface DismissableEntry {
  id: string;
  status: EntryStatus;
  /** The user has typed something into the correction box. */
  editing?: boolean;
  /** Already playing its exit animation. */
  dismissing?: boolean;
}

/**
 * Should this earlier entry be cleared automatically, now that a later
 * utterance has produced a result?
 *
 * A no-match is nearly always a cough, a false start, or background chatter.
 * Once the next card lands, that earlier noise is proven irrelevant and should
 * disappear instead of accumulating in the timeline.
 *
 * It is kept when:
 *  - it is the utterance that just succeeded,
 *  - it is anything other than an unmatched one (added cards and pending
 *    confirmations are real state; hard errors signal a genuine problem worth
 *    seeing, not mis-heard audio),
 *  - the user has started typing a correction — clearing it would destroy
 *    their work,
 *  - it is already on its way out.
 */
export function shouldAutoDismiss(entry: DismissableEntry, triggeringId: string): boolean {
  if (entry.id === triggeringId) return false;
  if (entry.status !== "unresolved") return false;
  if (entry.editing) return false;
  if (entry.dismissing) return false;
  return true;
}
