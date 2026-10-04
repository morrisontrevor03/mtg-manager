"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SwordsIcon } from "lucide-react";
import { toDeckText } from "@/lib/deckText";
import type { SerializedDeck, SerializedDeckCard } from "@/lib/deck";
import {
  BackLink as BackLinkBase,
  EmptyState,
  LoadError,
  Section,
  SkeletonLines,
  StatItem,
  StatRow,
  Surface,
} from "@/components/patterns";
import { CardPreview, CardThumb, ColorIdentity, ManaCost } from "@/components/mtg";
import { ManaCurve } from "@/components/charts";
import { DeckActions } from "@/components/decks/DeckActions";
import { useApi } from "@/lib/useApi";
import { timeAgo } from "@/lib/timeAgo";
import {
  CURVE_COLUMNS,
  TYPE_ORDER,
  curveBucket,
  pluralType,
  primaryType,
  type PrimaryType,
} from "@/lib/cardTypes";

/**
 * Deck detail.
 *
 * This was `/decks/[id]`, a server component. A static export cannot pre-render
 * a dynamic segment without `generateStaticParams`, and deck ids are cuids that
 * cannot be enumerated at build time — so the id travels as a query parameter
 * and the deck is fetched in the browser.
 */

const usd = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2 });

const count = (list: SerializedDeckCard[]) => list.reduce((n, c) => n + c.quantity, 0);

function CardRow({ c }: { c: SerializedDeckCard }) {
  return (
    <li className="flex items-center gap-2.5 rounded-md px-2 py-1 text-sm transition-colors duration-150 hover:bg-muted/50">
      <span className="numeral w-5 shrink-0 text-right text-muted-foreground">{c.quantity}</span>
      <CardPreview uri={c.imageUri} name={c.name}>
        <a
          href={c.scryfallUri}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 truncate decoration-primary/60 underline-offset-4 hover:underline"
        >
          {c.name}
        </a>
      </CardPreview>
      {c.acquire ? (
        <span className="shrink-0 text-xs text-primary" title="Suggested purchase">
          Acquire{c.estPrice ? ` · ${usd(c.estPrice)}` : ""}
        </span>
      ) : (
        !c.owned && (
          <span className="shrink-0 text-xs text-faint-foreground" title="Not enough copies owned">
            Not owned
          </span>
        )
      )}
      <span className="ml-auto shrink-0">
        <ManaCost cost={c.manaCost} size={13} />
      </span>
    </li>
  );
}

/** Cards filed under their primary type, in decklist order. */
function TypeGroups({ cards }: { cards: SerializedDeckCard[] }) {
  const groups = new Map<PrimaryType, SerializedDeckCard[]>();
  for (const c of cards) {
    const t = primaryType(c.typeLine);
    groups.set(t, [...(groups.get(t) ?? []), c]);
  }
  return (
    <div className="columns-1 gap-10 xl:columns-2">
      {TYPE_ORDER.filter((t) => groups.has(t)).map((t) => {
        const list = groups.get(t)!;
        return (
          <div key={t} className="mb-5 break-inside-avoid">
            <h3 className="mb-1 flex items-baseline gap-2 px-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{pluralType(t)}</span>
              <span className="numeral">{count(list)}</span>
            </h3>
            <ul>
              {list.map((c) => (
                <CardRow key={c.id} c={c} />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function deckCurve(cards: SerializedDeckCard[]) {
  const buckets = new Map<string, number>();
  for (const c of cards) {
    if (primaryType(c.typeLine) === "Land") continue;
    const b = curveBucket(c.cmc);
    buckets.set(b, (buckets.get(b) ?? 0) + c.quantity);
  }
  const columns = buckets.has("0") ? ["0", ...CURVE_COLUMNS] : CURVE_COLUMNS;
  return columns.map((label) => ({ label, value: buckets.get(label) ?? 0 }));
}

function BackLink() {
  return <BackLinkBase href="/decks">All decks</BackLinkBase>;
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
        <EmptyState icon={<SwordsIcon />} title="No deck selected">
          Pick one from{" "}
          <Link href="/decks" className="text-primary underline underline-offset-2">
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
        <SkeletonLines lines={3} />
        <SkeletonLines lines={10} />
      </div>
    );
  }

  const text = toDeckText(deck);
  const { groups, totals } = deck;
  const commander = groups.commander[0];
  const mainCount = totals.mainboardCount - (commander?.quantity ?? 0);

  return (
    <div className="space-y-9">
      <div className="ink-in space-y-4">
        <BackLink />
        <div className="flex items-start gap-4">
          {commander && (
            <CardPreview uri={commander.imageUri} name={commander.name}>
              <span className="hidden sm:block">
                <CardThumb uri={commander.imageUri} name={commander.name} className="h-16 w-[5.75rem]" />
              </span>
            </CardPreview>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="display text-[2rem] leading-tight font-semibold">{deck.name}</h1>
              <ColorIdentity colors={deck.colors} size={18} />
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              {commander && <span className="text-foreground">{commander.name}</span>}
              {commander && <span aria-hidden className="text-faint-foreground">·</span>}
              <span>{deck.format === "commander" ? "Commander" : "Standard"}</span>
              <span aria-hidden className="text-faint-foreground">·</span>
              <span className={deck.status === "final" ? "text-success" : undefined}>
                {deck.status === "final" ? "Final" : "Draft"}
              </span>
              <span aria-hidden className="text-faint-foreground">·</span>
              <time dateTime={deck.updatedAt} title={new Date(deck.updatedAt).toLocaleString()}>
                updated {timeAgo(deck.updatedAt)}
              </time>
            </p>
          </div>
        </div>
        {deck.description && <p className="max-w-prose text-muted-foreground">{deck.description}</p>}
      </div>

      <StatRow>
        <StatItem label="Cards" count={totals.mainboardCount} />
        {totals.acquireCount > 0 ? (
          <StatItem
            label="To acquire"
            count={totals.acquireCount}
            sub={`about ${usd(totals.acquireCostUsd)}`}
          />
        ) : (
          <StatItem
            label="To acquire"
            value={<span className="text-base font-medium text-success">Nothing</span>}
            sub="Buildable from your collection"
          />
        )}
        <StatItem label="Owned value" count={totals.ownedValueUsd} prefix="$" decimals={2} emphasis />
      </StatRow>

      <DeckActions
        deckId={deck.id}
        status={deck.status}
        name={deck.name}
        deckText={text}
        onChanged={reload}
      />

      <div className="grid gap-x-12 gap-y-10 border-t border-border pt-8 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="space-y-8">
          <Section title="Mainboard" meta={`${mainCount} cards`}>
            <div className="-mx-2">
              <TypeGroups cards={groups.mainboard} />
            </div>
          </Section>
          {groups.sideboard.length > 0 && (
            <Section title="Sideboard" meta={`${totals.sideboardCount} cards`}>
              <ul className="-mx-2">
                {groups.sideboard.map((c) => (
                  <CardRow key={c.id} c={c} />
                ))}
              </ul>
            </Section>
          )}
        </div>

        <Surface className="h-fit divide-y divide-border self-start [&>section]:p-5">
          <Section title="Mana curve" meta="non-land cards">
            <ManaCurve data={deckCurve([...groups.commander, ...groups.mainboard])} />
          </Section>
          <Section title="Why this deck">
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
              {deck.llmRationale || "No notes were saved with this deck."}
            </p>
          </Section>
          {deck.manaBaseNotes && (
            <Section title="Mana base">
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {deck.manaBaseNotes}
              </p>
            </Section>
          )}
          {deck.llmPrompt && (
            <Section title="Brief" meta={deck.llmModel || undefined}>
              <p className="text-sm text-muted-foreground italic">&ldquo;{deck.llmPrompt}&rdquo;</p>
            </Section>
          )}
        </Surface>
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
          <SkeletonLines lines={3} />
        </div>
      }
    >
      <DeckView />
    </Suspense>
  );
}
