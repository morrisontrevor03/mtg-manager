/**
 * Turns one speech transcript into an intent: either a control command, or a
 * card-name query with an optional quantity and foil flag.
 *
 * Kept pure and free of DOM types so it can be unit tested and reused on the
 * server by the /api/cards/match route.
 */

export type VoiceCommand =
  | "undo"
  | "stop"
  | "skip"
  | "yes"
  | "no"
  | "pick1"
  | "pick2"
  | "pick3";

export interface VoiceIntent {
  /** Set when the whole utterance was a control phrase. */
  command: VoiceCommand | null;
  quantity: number;
  foil: boolean;
  /** The card name to look up. Empty when there is nothing searchable. */
  query: string;
  /** The original transcript, for display. */
  raw: string;
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  to: 2, // "to" is a frequent mis-transcription of "two"
  too: 2,
  three: 3,
  four: 4,
  for: 4, // likewise "for" for "four" — only honoured mid-phrase, see below
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  ate: 8,
  nine: 9,
  ten: 10,
};

/** Words that are only a quantity when something follows them. */
const RISKY_NUMBER_WORDS = new Set(["a", "an", "to", "too", "for", "ate"]);

const COMMANDS: Record<string, VoiceCommand> = {
  undo: "undo",
  "undo that": "undo",
  "scratch that": "undo",
  "remove that": "undo",
  "delete that": "undo",
  stop: "stop",
  "stop listening": "stop",
  done: "stop",
  finish: "stop",
  finished: "stop",
  skip: "skip",
  "skip it": "skip",
  cancel: "skip",
  nevermind: "skip",
  "never mind": "skip",
  yes: "yes",
  yeah: "yes",
  yep: "yes",
  correct: "yes",
  confirm: "yes",
  no: "no",
  nope: "no",
  wrong: "no",
  one: "pick1",
  first: "pick1",
  "number one": "pick1",
  two: "pick2",
  second: "pick2",
  "number two": "pick2",
  three: "pick3",
  third: "pick3",
  "number three": "pick3",
};

/** Words that carry no search signal on their own. */
const STOPWORDS = new Set(["the", "a", "an", "of", "and", "to", "or", "um", "uh", "er"]);

function clean(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pull a leading quantity off the token list, mutating nothing.
 * Returns the quantity and the remaining tokens.
 */
function takeLeadingQuantity(tokens: string[]): { quantity: number; rest: string[] } {
  if (tokens.length === 0) return { quantity: 1, rest: tokens };

  const [head, ...tail] = tokens;

  // "4x lightning bolt" / "4 lightning bolt"
  const digits = /^(\d{1,3})x?$/.exec(head);
  if (digits) {
    const n = parseInt(digits[1], 10);
    if (n >= 1 && tail.length > 0) return { quantity: Math.min(n, 999), rest: tail };
  }

  const word = NUMBER_WORDS[head];
  if (word !== undefined) {
    // A bare "a"/"for"/"to" is far more likely part of the name than a count,
    // so only treat these as a quantity when a name follows.
    if (RISKY_NUMBER_WORDS.has(head) && tail.length === 0) {
      return { quantity: 1, rest: tokens };
    }
    if (tail.length === 0) return { quantity: 1, rest: tokens };
    // "four times lightning bolt"
    const rest = tail[0] === "times" ? tail.slice(1) : tail;
    if (rest.length === 0) return { quantity: 1, rest: tokens };
    return { quantity: word, rest };
  }

  return { quantity: 1, rest: tokens };
}

/** Strip a leading or trailing "foil". */
function takeFoil(tokens: string[]): { foil: boolean; rest: string[] } {
  let foil = false;
  let rest = tokens;
  if (rest[0] === "foil") {
    foil = true;
    rest = rest.slice(1);
  }
  if (rest.length > 0 && rest[rest.length - 1] === "foil") {
    foil = true;
    rest = rest.slice(0, -1);
  }
  return { foil, rest };
}

export function parseVoiceInput(transcript: string): VoiceIntent {
  const raw = transcript.trim();
  const cleaned = clean(raw);

  const base: VoiceIntent = { command: null, quantity: 1, foil: false, query: "", raw };

  if (!cleaned) return base;

  // A control phrase only counts when it is the entire utterance — otherwise
  // "Two-Headed Giant" would read as the "pick2" command.
  const command = COMMANDS[cleaned];
  if (command) return { ...base, command };

  let tokens = cleaned.split(" ");

  const withFoil = takeFoil(tokens);
  tokens = withFoil.rest;

  const withQuantity = takeLeadingQuantity(tokens);
  tokens = withQuantity.rest;

  // A trailing "foil" may only now be exposed ("four sol ring foil" handled above,
  // but "foil four sol ring" leaves it here).
  const withFoilAgain = takeFoil(tokens);
  tokens = withFoilAgain.rest;

  const query = tokens.join(" ");
  const meaningful = tokens.some((t) => !STOPWORDS.has(t));

  return {
    command: null,
    quantity: withQuantity.quantity,
    foil: withFoil.foil || withFoilAgain.foil,
    query: meaningful ? query : "",
    raw,
  };
}
