"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { Badge, ColorPips, EmptyState, ManaCost, Panel } from "@/components/ui";
import { StopIcon, WaveformIcon } from "@/components/icons";
import { useSpeechRecognition } from "@/components/collection/useSpeechRecognition";
import { beep } from "@/lib/beep";
import { shouldAutoDismiss, type EntryStatus } from "@/lib/voiceSession";
import type { VoiceCommand } from "@/lib/voiceParse";

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

/** A spoken command, styled like a key cap. */
function Kbd({ children }: { children: ReactNode }) {
  return (
    <span className="mx-0.5 rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-foreground">
      {children}
    </span>
  );
}

export function VoiceEntry() {
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
        const res = await fetch("/api/collection", {
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
      await fetch(`/api/collection/${entry.itemId}`, {
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
        const res = await fetch("/api/cards/match", {
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
      <Panel title="Voice entry unavailable">
        <p className="text-accent">
          This browser doesn&apos;t support the Web Speech API. Voice entry works in Chrome,
          Edge, and Safari.
        </p>
        <p className="mt-2 text-sm text-muted">
          You can still add cards with the manual form or the list import on the{" "}
          <a href="/collection" className="text-accent underline">
            Collection page
          </a>
          .
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={toggle}
            className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
              listening
                ? "listening-halo border border-[color:var(--danger)]/50 bg-[color:var(--danger)]/15 text-[color:var(--danger)]"
                : "btn"
            }`}
            aria-label={listening ? "Stop listening" : "Start listening"}
          >
            {listening ? <StopIcon size={20} /> : <WaveformIcon size={26} />}
          </button>

          <div className="min-w-0 flex-1">
            {listening ? (
              <div className="flex items-center gap-2">
                <WaveformIcon size={16} active className="text-[color:var(--danger)]" />
                <span className="text-sm font-medium">Listening — say a card name</span>
              </div>
            ) : (
              <span className="text-sm font-medium">Tap to start listening</span>
            )}
            <p className="mt-1 min-h-6 truncate text-lg text-muted">
              {interim || (listening ? "…" : "")}
            </p>
          </div>

          <div className="flex gap-5 text-center">
            <div>
              <div className="display numeral text-2xl font-semibold">{added.length}</div>
              <div className="eyebrow">cards</div>
            </div>
            <div>
              <div className="display numeral text-2xl font-semibold">{copies}</div>
              <div className="eyebrow">copies</div>
            </div>
            {needsAttention > 0 && (
              <div>
                <div className="display numeral text-2xl font-semibold text-accent">
                  {needsAttention}
                </div>
                <div className="eyebrow">to review</div>
              </div>
            )}
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-[color:var(--danger)]">{error}</p>}

        <p className="mt-4 border-t border-border pt-3 text-xs text-muted">
          Try <em className="text-foreground">&ldquo;four Lightning Bolt&rdquo;</em> or{" "}
          <em className="text-foreground">&ldquo;foil Sol Ring&rdquo;</em>. Say{" "}
          <Kbd>one</Kbd> <Kbd>two</Kbd> <Kbd>three</Kbd> to pick a suggestion,{" "}
          <Kbd>undo</Kbd> to remove the last card, <Kbd>stop</Kbd> to finish.
        </p>
      </Panel>

      {entries.length === 0 ? (
        <EmptyState icon="🂠" title="Nothing captured yet">
          Start listening and announce your first card. It gets matched, enriched, and added
          without you touching the keyboard.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className={entry.dismissing ? "settle-out" : undefined}>
              <EntryCard
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
  );
}

// --- One entry, rendered per stage ---------------------------------------

function EntryCard({
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

  const heading = (
    <div className="flex items-baseline gap-2">
      <span className="font-medium">
        {entry.quantity > 1 && `${entry.quantity}× `}
        {entry.matchedName ?? entry.raw}
      </span>
      {entry.foil && <span className="text-xs text-accent">✦ foil</span>}
      {entry.score !== undefined && entry.status !== "enriched" && (
        <span className="text-xs text-muted">{Math.round(entry.score * 100)}% match</span>
      )}
    </div>
  );

  const transcript = <p className="text-xs text-muted">heard: &ldquo;{entry.raw}&rdquo;</p>;

  switch (entry.status) {
    case "heard":
      return (
        <div className="card fade-in flex items-center gap-3 p-3.5">
          <span className="pulse-dot h-2 w-2 shrink-0 rounded-full bg-accent" />
          <span className="truncate text-muted">&ldquo;{entry.raw}&rdquo;</span>
          <span className="eyebrow ml-auto shrink-0">matching</span>
        </div>
      );

    case "matched":
    case "enriching":
      return (
        <div className="card fade-in flex gap-3.5 p-3.5">
          <div className="shimmer h-[88px] w-16 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            {heading}
            {transcript}
            <div className="shimmer h-3 w-2/3 rounded-full" />
            <div className="shimmer h-3 w-1/3 rounded-full" />
          </div>
          <span className="eyebrow shrink-0 self-start">enriching</span>
        </div>
      );

    case "enriched": {
      const card = entry.card;
      const usd = parseFloat(
        (entry.foil ? card?.prices?.usd_foil ?? card?.prices?.usd : card?.prices?.usd) ?? "",
      );
      return (
        <div className="card card-lift landed flex gap-3.5 p-3.5">
          {card?.imageUri ? (
            <Image
              src={card.imageUri}
              alt={card.name}
              width={64}
              height={88}
              className="fade-in h-[88px] w-16 shrink-0 rounded-lg object-cover shadow-[0_6px_16px_-8px_rgba(0,0,0,0.9)] ring-1 ring-border"
              unoptimized
            />
          ) : (
            <div className="h-[88px] w-16 shrink-0 rounded-lg bg-surface-2 ring-1 ring-border" />
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <a
                href={card?.scryfallUri}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium hover:underline"
              >
                {entry.quantity > 1 && `${entry.quantity}× `}
                {card?.name ?? entry.matchedName}
              </a>
              <ManaCost cost={card?.manaCost ?? ""} />
              {card?.colors && <ColorPips colors={card.colors} />}
              {entry.foil && <span className="text-xs text-accent">✦ foil</span>}
            </div>
            <p className="text-sm text-muted">{card?.typeLine}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="font-mono">
                {card?.setCode} {card?.collectorNumber}
              </span>
              {card?.rarity && <Badge>{card.rarity}</Badge>}
              {Number.isFinite(usd) && usd > 0 && <span>${usd.toFixed(2)}</span>}
            </div>
            {transcript}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge tone="good">added</Badge>
            <button onClick={onUndo} className="text-xs text-[color:var(--danger)] hover:underline">
              undo
            </button>
          </div>
        </div>
      );
    }

    case "confirming":
      return (
        <div className="card fade-in border-accent/40 p-3">
          <div className="mb-2">
            <span className="font-medium text-accent">Did you mean…</span>
            {transcript}
          </div>
          <ul className="space-y-1">
            {entry.candidates?.map((c, i) => (
              <li key={c.name}>
                <button
                  onClick={() => onPick(c)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-accent/20"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-2 text-xs font-bold">
                    {i + 1}
                  </span>
                  <span className="flex-1">
                    {entry.quantity > 1 && `${entry.quantity}× `}
                    {c.name}
                  </span>
                  <span className="text-xs text-muted">{Math.round(c.score * 100)}%</span>
                </button>
              </li>
            ))}
          </ul>
          <button onClick={onSkip} className="mt-2 text-xs text-muted hover:underline">
            none of these
          </button>
        </div>
      );

    case "unresolved":
    case "error":
      return (
        <div className="card fade-in border-accent/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="warn">{entry.status === "error" ? "failed" : "no match"}</Badge>
            <span className="text-sm text-muted">&ldquo;{entry.raw}&rdquo;</span>
            {/* Say so up front, so the row vanishing later is expected. */}
            {entry.status === "unresolved" && !entry.editing && (
              <span className="text-[11px] text-muted-dim">clears when the next card lands</span>
            )}
            <button
              onClick={onDismiss}
              className="ml-auto text-xs text-muted hover:underline"
              aria-label="Dismiss"
            >
              dismiss
            </button>
          </div>
          {entry.message && <p className="mt-1 text-xs text-[color:var(--danger)]">{entry.message}</p>}
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const name = correction.trim();
              if (name) onRetry(name);
            }}
          >
            <input
              className="input"
              placeholder="Type the correct card name…"
              value={correction}
              onChange={(e) => editCorrection(e.target.value)}
            />
            <button className="btn shrink-0 text-sm" disabled={!correction.trim()}>
              Add
            </button>
          </form>
        </div>
      );
  }
}
