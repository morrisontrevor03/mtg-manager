"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "cn";
import { AlertTriangleIcon, CheckIcon, LoaderCircleIcon, MicOffIcon } from "lucide-react";
import { CardThumb, FoilMark, Printing } from "@/components/mtg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { StopIcon, WaveformIcon } from "@/components/icons";
import { useSpeechRecognition } from "@/components/collection/useSpeechRecognition";
import { beep } from "@/lib/beep";
import { shouldAutoDismiss, type EntryStatus } from "@/lib/voiceSession";
import type { VoiceCommand } from "@/lib/voiceParse";
import { apiFetch } from "@/lib/authClient";

interface EnrichedCard {
  id: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  typeLine: string;
  manaCost: string;
  cmc: number;
  rarity: string;
  colors: string[];
  imageUri: string;
  prices: { usd?: string | null; usd_foil?: string | null };
  scryfallUri: string;
}

interface Candidate {
  name: string;
  score: number;
}

interface Entry {
  id: string;
  raw: string;
  status: EntryStatus;
  quantity: number;
  foil: boolean;
  matchedName?: string;
  score?: number;
  candidates?: Candidate[];
  card?: EnrichedCard;
  /** CollectionItem id and the arithmetic needed to undo this add. */
  itemId?: string;
  quantityAfter?: number;
  message?: string;
  /** The user has started typing a correction — protects it from auto-dismissal. */
  editing?: boolean;
  /** Playing its exit animation, about to be removed. */
  dismissing?: boolean;
}

interface MatchResponse {
  raw: string;
  command: VoiceCommand | null;
  quantity: number;
  foil: boolean;
  query: string;
  decision: "auto" | "confirm" | "none" | "command";
  candidates: Candidate[];
}

let seq = 0;
const nextId = () => `e${++seq}`;

/**
 * Hands-free card entry. Rendered as the body of the voice dialog on the
 * Collection page; `onDone` closes it. Each spoken phrase becomes one entry
 * that is matched, enriched from Scryfall and added while the mic stays live.
 */
export function VoiceEntry({ onDone }: { onDone?: () => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);

  // Voice commands arrive from async recogniser events and need the current
  // list without re-binding the recognizer, so it is mirrored into a ref.
  const entriesRef = useRef<Entry[]>([]);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  // Assigned once the recogniser below is wired up; a "stop" command reads it.
  const stopRef = useRef<(() => void) | null>(null);

  const update = useCallback((id: string, patch: Partial<Entry>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  const remove = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  /** Fade an entry out, then drop it. */
  const dismiss = useCallback(
    (id: string) => {
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, dismissing: true } : e)));
      setTimeout(() => remove(id), 320);
    },
    [remove],
  );

  /**
   * Clear failed utterances once a later one succeeds.
   *
   * A no-match is nearly always a cough, a false start, or background speech.
   * The moment the next card lands, that earlier noise is proven irrelevant, so
   * it goes away on its own instead of piling up in the timeline.
   *
   * Two deliberate exceptions: entries the user has started typing a correction
   * into (that would throw away their work), and hard errors, which signal a
   * real problem worth seeing rather than mis-heard audio.
   */
  const clearStaleMisses = useCallback(
    (triggeringId: string) => {
      for (const e of entriesRef.current) {
        if (shouldAutoDismiss(e, triggeringId)) dismiss(e.id);
      }
    },
    [dismiss],
  );

  /**
   * Add a confirmed card. Runs independently per entry so the microphone keeps
   * listening while earlier cards are still being enriched.
   */
  const enrich = useCallback(
    async (id: string, name: string, quantity: number, foil: boolean, score?: number) => {
      update(id, { status: "enriching", matchedName: name, score });
      try {
        const res = await apiFetch("/api/collection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, quantity, foil }),
        });
        const data = await res.json();
        if (!res.ok) {
          beep("failed");
          update(id, { status: "error", message: data.error ?? "Could not add that card." });
          return;
        }
        beep("added");
        update(id, {
          status: "enriched",
          card: data.card,
          itemId: data.id,
          quantityAfter: data.quantity,
          matchedName: data.name,
        });
      } catch (err) {
        beep("failed");
        update(id, {
          status: "error",
          message: err instanceof Error ? err.message : "Network error.",
        });
      }
    },
    [update],
  );

  /** Reverse a completed add, restoring the previous quantity. */
  const undoEntry = useCallback(
    async (entry: Entry) => {
      if (!entry.itemId || entry.quantityAfter === undefined) return;
      const remaining = entry.quantityAfter - entry.quantity;
      await apiFetch(`/api/collection/${entry.itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: Math.max(0, remaining) }),
      });
      remove(entry.id);
    },
    [remove],
  );

  const resolveCandidate = useCallback(
    (entry: Entry, candidate: Candidate) => {
      void enrich(entry.id, candidate.name, entry.quantity, entry.foil, candidate.score);
    },
    [enrich],
  );

  const handleCommand = useCallback(
    (command: VoiceCommand) => {
      const list = entriesRef.current;
      const pending = list.find((e) => e.status === "confirming");

      switch (command) {
        case "undo": {
          const last = list.find((e) => e.status === "enriched");
          if (last) void undoEntry(last);
          return;
        }
        case "skip":
        case "no":
          if (pending) update(pending.id, { status: "unresolved", candidates: undefined });
          return;
        case "yes":
        case "pick1":
        case "pick2":
        case "pick3": {
          if (!pending?.candidates?.length) return;
          const index = command === "pick2" ? 1 : command === "pick3" ? 2 : 0;
          const choice = pending.candidates[index];
          if (choice) resolveCandidate(pending, choice);
          return;
        }
        case "stop":
          stopRef.current?.();
          return;
      }
    },
    [resolveCandidate, undoEntry, update],
  );

  /** Send one finalised utterance through match, then add or ask. */
  const submitTranscript = useCallback(
    async (transcript: string) => {
      const id = nextId();
      setEntries((prev) => [{ id, raw: transcript, status: "heard", quantity: 1, foil: false }, ...prev]);

      try {
        const res = await apiFetch("/api/cards/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript }),
        });
        const data: MatchResponse = await res.json();

        if (!res.ok) {
          update(id, { status: "error", message: "Matching failed." });
          return;
        }

        if (data.decision === "command" && data.command) {
          remove(id); // a command is not a collection entry
          handleCommand(data.command);
          return;
        }

        update(id, { quantity: data.quantity, foil: data.foil });

        if (data.decision === "auto" && data.candidates[0]) {
          const best = data.candidates[0];
          clearStaleMisses(id);
          void enrich(id, best.name, data.quantity, data.foil, best.score);
          return;
        }

        if (data.decision === "confirm" && data.candidates.length) {
          beep("confirm");
          clearStaleMisses(id);
          update(id, { status: "confirming", candidates: data.candidates });
          return;
        }

        beep("failed");
        update(id, { status: "unresolved" });
      } catch {
        update(id, { status: "error", message: "Network error." });
      }
    },
    [clearStaleMisses, enrich, handleCommand, remove, update],
  );

  const { support, listening, interim, error, toggle, stop } = useSpeechRecognition({
    onFinal: (t) => void submitTranscript(t),
  });

  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  const added = entries.filter((e) => e.status === "enriched");
  const copies = added.reduce((n, e) => n + e.quantity, 0);
  const needsAttention = entries.filter(
    (e) =>
      !e.dismissing &&
      (e.status === "confirming" || e.status === "unresolved" || e.status === "error"),
  ).length;


  if (support === "unsupported") {
    return (
      <div className="flex gap-3 rounded-lg bg-muted/60 p-4 text-sm">
        <MicOffIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="font-medium">This browser can&rsquo;t do speech recognition</p>
          <p className="mt-1 text-muted-foreground">
            Voice entry works in Chrome, Edge and Safari. Here, use Add manually or Import list
            instead.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-listening={listening}>
      {/* Stage: the control, the waveform, and what is being heard right now. */}
      <div className="rounded-lg bg-background/70 px-4 py-4 ring-1 ring-border/70 sm:px-5">
        <div className="flex items-center gap-4">
          <Button
            onClick={toggle}
            variant={listening ? "destructive" : "default"}
            className={cn("size-12 shrink-0 rounded-full", listening && "listening-ring")}
            aria-label={listening ? "Stop listening" : "Start listening"}
          >
            {listening ? <StopIcon className="size-4" /> : <WaveformIcon className="size-5" />}
          </Button>

          <Waveform className={listening ? "text-foreground/75" : "text-muted-foreground/35"} />

          <span
            className={cn(
              "flex shrink-0 items-center gap-1.5 text-xs",
              listening ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                listening ? "pulse-dot bg-destructive" : "bg-faint-foreground",
              )}
            />
            {listening ? "Listening" : "Paused"}
          </span>
        </div>

        <p
          aria-live="polite"
          className={cn(
            "mt-3 min-h-7 truncate text-lg",
            interim ? "text-foreground italic" : "text-faint-foreground",
          )}
        >
          {interim
            ? `“${interim}”`
            : listening
              ? "Say a card name, then pause…"
              : "Press the button and read your cards out, one at a time."}
        </p>

        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>

      {/* What was heard, newest first. */}
      <div>
        <div className="mb-1.5 flex items-baseline gap-3">
          <h3 className="text-sm font-medium">Detected cards</h3>
          {added.length > 0 && (
            <span className="text-xs text-muted-foreground">
              <span className="numeral">{added.length}</span> added ·{" "}
              <span className="numeral">{copies}</span> {copies === 1 ? "copy" : "copies"}
            </span>
          )}
          {needsAttention > 0 && (
            <span className="text-xs text-primary">
              <span className="numeral">{needsAttention}</span> to review
            </span>
          )}
        </div>

        {entries.length === 0 ? (
          <p className="border-t border-border py-6 text-sm text-faint-foreground">
            Nothing yet. Try <em className="text-muted-foreground">&ldquo;four Lightning Bolt&rdquo;</em>{" "}
            or <em className="text-muted-foreground">&ldquo;foil Sol Ring&rdquo;</em>.
          </p>
        ) : (
          <ul className="max-h-[42vh] divide-y divide-border/70 overflow-y-auto border-t border-border">
            {entries.map((entry) => (
              <li key={entry.id} className={entry.dismissing ? "settle-out" : undefined}>
                <EntryRow
                  entry={entry}
                  onPick={(c) => resolveCandidate(entry, c)}
                  onSkip={() => update(entry.id, { status: "unresolved", candidates: undefined })}
                  onUndo={() => void undoEntry(entry)}
                  onRetry={(name) => void enrich(entry.id, name, entry.quantity, entry.foil)}
                  onDismiss={() => dismiss(entry.id)}
                  onEditingChange={(editing) => update(entry.id, { editing })}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-border pt-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Say <Kbd>one</Kbd> <Kbd>two</Kbd> <Kbd>three</Kbd> to pick a suggestion,{" "}
          <Kbd>undo</Kbd> to take back the last card, <Kbd>stop</Kbd> to finish.
        </p>
        {onDone && (
          <Button
            variant="outline"
            className="ml-auto"
            onClick={() => {
              stop();
              onDone();
            }}
          >
            Done
          </Button>
        )}
      </div>
    </div>
  );
}

// --- Waveform ----------------------------------------------------------------

/*
 * Fixed, hand-shaped bar heights (tallest in the middle) with per-bar timing,
 * so the strip moves like speech rather than a metronome. It is a listening
 * indicator, not a level meter: the recogniser does not expose audio levels.
 */
const BARS = Array.from({ length: 36 }, (_, i) => {
  const centre = 1 - Math.abs(i - 17.5) / 18;
  const jitter = Math.abs(Math.sin(i * 2.3) * Math.cos(i * 0.7));
  return {
    height: Math.round(22 + 70 * (0.35 * centre + 0.65 * jitter)),
    duration: 0.62 + ((i * 37) % 50) / 100,
    delay: -((i * 53) % 90) / 100,
  };
});

function Waveform({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("flex h-10 min-w-0 flex-1 items-center gap-[3px] transition-colors", className)}
    >
      {BARS.map((b, i) => (
        <span
          key={i}
          className="voice-bar w-[3px] shrink-0 rounded-full bg-current max-sm:[&:nth-child(n+25)]:hidden"
          style={
            {
              height: `${b.height}%`,
              "--bar-dur": `${b.duration}s`,
              "--bar-delay": `${b.delay}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

// --- One entry, rendered per stage ---------------------------------------

function EntryRow({
  entry,
  onPick,
  onSkip,
  onUndo,
  onRetry,
  onDismiss,
  onEditingChange,
}: {
  entry: Entry;
  onPick: (c: Candidate) => void;
  onSkip: () => void;
  onUndo: () => void;
  onRetry: (name: string) => void;
  onDismiss: () => void;
  onEditingChange: (editing: boolean) => void;
}) {
  const [correction, setCorrection] = useState("");

  // Report only the empty <-> non-empty transition, so the parent re-renders
  // twice per correction rather than once per keystroke.
  function editCorrection(next: string) {
    const wasEditing = correction.trim().length > 0;
    const isEditing = next.trim().length > 0;
    setCorrection(next);
    if (wasEditing !== isEditing) onEditingChange(isEditing);
  }

  const qty = <span className="numeral text-muted-foreground"> ×{entry.quantity}</span>;

  switch (entry.status) {
    case "heard":
    case "matched":
    case "enriching":
      return (
        <div className="fade-in flex items-center gap-3 py-2.5">
          <span className="flex h-8 w-11 shrink-0 items-center justify-center rounded-[4px] bg-muted">
            <LoaderCircleIcon aria-hidden className="size-3.5 animate-spin text-faint-foreground" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm">
            {entry.matchedName ? (
              <>
                {entry.matchedName}
                {qty}
              </>
            ) : (
              <span className="text-muted-foreground italic">&ldquo;{entry.raw}&rdquo;</span>
            )}
          </span>
          <span className="shrink-0 text-xs text-faint-foreground">
            {entry.status === "heard" ? "Matching…" : "Adding…"}
          </span>
        </div>
      );

    case "enriched": {
      const card = entry.card;
      return (
        <div className="landed group flex items-center gap-3 py-2.5">
          <CardThumb uri={card?.imageUri} name={card?.name ?? entry.matchedName ?? ""} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <a
                href={card?.scryfallUri}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-sm font-medium hover:underline"
              >
                {card?.name ?? entry.matchedName}
              </a>
              <span className="numeral text-sm text-muted-foreground">×{entry.quantity}</span>
              {entry.foil && <FoilMark />}
            </div>
            {card && (
              <Printing
                className="mt-0.5"
                setCode={card.setCode}
                collectorNumber={card.collectorNumber}
                rarity={card.rarity}
              />
            )}
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={onUndo}
            className="opacity-0 group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
          >
            Undo
          </Button>
          <CheckIcon aria-label="Added" className="size-4 shrink-0 text-success" />
        </div>
      );
    }

    case "confirming":
      return (
        <div className="fade-in py-3">
          <p className="text-sm">
            <span className="text-primary">Which card?</span>{" "}
            <span className="text-muted-foreground italic">heard &ldquo;{entry.raw}&rdquo;</span>
          </p>
          <ol className="mt-2 grid gap-1 sm:grid-cols-3">
            {entry.candidates?.map((c, i) => (
              <li key={c.name}>
                <button
                  onClick={() => onPick(c)}
                  className="flex w-full items-center gap-2 rounded-md bg-muted/70 px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
                >
                  <Kbd>{i + 1}</Kbd>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="numeral text-[11px] text-faint-foreground">
                    {Math.round(c.score * 100)}%
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <Button variant="link" size="xs" onClick={onSkip} className="mt-1 px-0 text-muted-foreground">
            None of these
          </Button>
        </div>
      );

    case "unresolved":
    case "error":
      return (
        <div className="fade-in py-3">
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangleIcon aria-hidden className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 truncate">
              {entry.status === "error" ? "Couldn’t add" : "No match for"}{" "}
              <span className="text-muted-foreground italic">&ldquo;{entry.raw}&rdquo;</span>
            </span>
            {/* Say so up front, so the row vanishing later is expected. */}
            {entry.status === "unresolved" && !entry.editing && (
              <span className="hidden shrink-0 text-[11px] text-faint-foreground sm:inline">
                clears when the next card lands
              </span>
            )}
            <Button
              variant="ghost"
              size="xs"
              onClick={onDismiss}
              className="ml-auto text-muted-foreground"
            >
              Dismiss
            </Button>
          </div>
          {entry.message && <p className="mt-1 pl-6 text-xs text-destructive">{entry.message}</p>}
          <form
            className="mt-2 flex gap-2 pl-6"
            onSubmit={(e) => {
              e.preventDefault();
              const name = correction.trim();
              if (name) onRetry(name);
            }}
          >
            <Input
              aria-label="Correct card name"
              placeholder="Type the card name"
              className="h-8"
              value={correction}
              onChange={(e) => editCorrection(e.target.value)}
            />
            <Button type="submit" size="sm" variant="outline" disabled={!correction.trim()}>
              Add
            </Button>
          </form>
        </div>
      );
  }
}
