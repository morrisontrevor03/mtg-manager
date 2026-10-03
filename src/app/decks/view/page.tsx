"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toDeckText } from "@/lib/deckText";
import type { SerializedDeck, SerializedDeckCard } from "@/lib/deck";
import {
  Badge,
  ColorPips,
  EmptyState,
  LoadError,
  ManaCost,
  Panel,
  Skeleton,
  Stat,
} from "@/components/ui";
import { DeckActions } from "@/components/decks/DeckActions";
import { useApi } from "@/lib/useApi";

/**
 * Deck detail.
 *
 * This was `/decks/[id]`, a server component. A static export cannot pre-render
 * a dynamic segment without `generateStaticParams`, and deck ids are cuids that
 * cannot be enumerated at build time — so the id travels as a query parameter
 * and the deck is fetched in the browser.
 */

function CardRow({ c }: { c: SerializedDeckCard }) {
  return (
    <li className="flex items-center gap-2 rounded-md px-1 py-1 text-sm transition-colors duration-200 hover:bg-surface-2/60">
      <span className="numeral w-6 shrink-0 text-right text-muted">{c.quantity}</span>
      <a
        href={c.scryfallUri}
        target="_blank"
        rel="noopener noreferrer"
        className="decoration-accent/60 underline-offset-2 hover:underline"
      >
        {c.name}
      </a>
      <ManaCost cost={c.manaCost} />
      {c.acquire ? (
        <Badge tone="warn">acquire{c.estPrice ? ` ~$${c.estPrice.toFixed(2)}` : ""}</Badge>
      ) : c.owned ? (
        <Badge tone="good">owned</Badge>
      ) : (
        <Badge tone="warn">not owned</Badge>
      )}
      <span className="ml-auto hidden text-xs text-muted sm:inline">{c.typeLine}</span>
    </li>
  );
}

function BackLink() {
  return (
    <Link
      href="/decks"
      className="inline-block text-sm text-muted transition-colors hover:text-foreground"
    >
      ← All decks
    </Link>
  );
}

function DeckView() {
  const id = useSearchParams().get("id");
  const { data: deck, error, loading, reload } = useApi<SerializedDeck>(
    id ? `/api/decks/${encodeURIComponent(id)}` : null,
  );

  if (!id) {
    return (
      <div className="space-y-7">
        <BackLink />
        <EmptyState icon="⚔" title="No deck selected">
          Pick one from{" "}
          <Link href="/decks" className="text-accent underline underline-offset-2">
            your decks
          </Link>
          .
        </EmptyState>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-7">
        <BackLink />
        <LoadError message={error} onRetry={reload} />
      </div>
    );
  }

  if (loading || !deck) {
    return (
      <div className="space-y-7">
        <BackLink />
        <Skeleton lines={3} />
        <Panel title="Mainboard">
          <Skeleton lines={10} />
        </Panel>
      </div>
    );
  }

  const text = toDeckText(deck);
  const { groups, totals } = deck;

  return (
    <div className="space-y-7">
      <div className="ink-in space-y-3">
        <BackLink />
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="display text-3xl font-semibold">{deck.name}</h1>
          <ColorPips colors={deck.colors} />
          <Badge tone="info">{deck.format}</Badge>
          <Badge tone={deck.status === "final" ? "good" : "default"}>{deck.status}</Badge>
        </div>
        {deck.description && <p className="max-w-prose text-muted">{deck.description}</p>}
      </div>

      <div className="stagger grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Cards" count={totals.mainboardCount} />
        <Stat label="To acquire" count={totals.acquireCount} />
        <Stat label="Acquire cost" count={totals.acquireCostUsd} prefix="$" decimals={2} />
        <Stat label="Owned value" count={totals.ownedValueUsd} prefix="$" decimals={2} />
      </div>

      <DeckActions
        deckId={deck.id}
        status={deck.status}
        name={deck.name}
        deckText={text}
        onChanged={reload}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {groups.commander.length > 0 && (
            <Panel title="Commander">
              <ul>
                {groups.commander.map((c) => (
                  <CardRow key={c.id} c={c} />
                ))}
              </ul>
            </Panel>
          )}
          <Panel
            title={`Mainboard (${totals.mainboardCount - (groups.commander[0]?.quantity ?? 0)})`}
          >
            <ul>
              {groups.mainboard.map((c) => (
                <CardRow key={c.id} c={c} />
              ))}
            </ul>
          </Panel>
          {groups.sideboard.length > 0 && (
            <Panel title={`Sideboard (${totals.sideboardCount})`}>
              <ul>
                {groups.sideboard.map((c) => (
                  <CardRow key={c.id} c={c} />
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          {deck.manaBaseNotes && (
            <Panel title="Mana base notes">
              <p className="whitespace-pre-wrap text-sm text-muted">{deck.manaBaseNotes}</p>
            </Panel>
          )}
          <Panel title="Why this deck">
            <p className="whitespace-pre-wrap text-sm text-muted">{deck.llmRationale || "—"}</p>
          </Panel>
          <Panel title="Prompt">
            <p className="text-sm text-muted">{deck.llmPrompt}</p>
            <p className="mt-2 text-xs text-muted">Model: {deck.llmModel || "—"}</p>
          </Panel>
        </div>
      </div>
    </div>
  );
}

export default function DeckDetailPage() {
  // `useSearchParams` needs a Suspense boundary to prerender during export.
  return (
    <Suspense
      fallback={
        <div className="space-y-7">
          <BackLink />
          <Skeleton lines={3} />
        </div>
      }
    >
      <DeckView />
    </Suspense>
  );
}
