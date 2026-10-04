"use client";

import Link from "next/link";
import { LayersIcon, PlusIcon } from "lucide-react";
import { BarList, ColourBreakdown, ManaCurve, RarityBreakdown } from "@/components/charts";
import {
  ActionLink,
  EmptyState,
  LoadError,
  PageHeader,
  Section,
  SkeletonLines,
  StatItem,
  StatRow,
  Surface,
} from "@/components/patterns";
import { CardPreview, CardThumb, FoilMark, ManaCost, Printing, SetSymbol } from "@/components/mtg";
import { SparkIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/useApi";
import { useSets } from "@/lib/useSets";
import { timeAgo } from "@/lib/timeAgo";
import type { DashboardCard, DashboardData } from "@/lib/aggregate";

const usd = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export default function DashboardPage() {
  const { data: d, error, loading, reload } = useApi<DashboardData>("/api/dashboard");

  return (
    <div className="space-y-10">
      <PageHeader
        title="Dashboard"
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/collection?add=manual">
                <PlusIcon />
                Add cards
              </Link>
            </Button>
            <Button asChild>
              <Link href="/decks/new">
                <SparkIcon size={14} />
                Build a deck
              </Link>
            </Button>
          </>
        }
      />

      {error ? (
        <LoadError message={error} onRetry={reload} />
      ) : loading || !d ? (
        <DashboardSkeleton />
      ) : d.totalCards === 0 ? (
        <EmptyState
          icon={<LayersIcon />}
          title="Your collection is empty"
          action={<ActionLink href="/collection">Add your first cards</ActionLink>}
        >
          Type cards in by name, paste a list from another app, or read them out with voice
          entry. Prices, sets and art are filled in from Scryfall.
        </EmptyState>
      ) : (
        <>
          <StatRow className="ink-in">
            <StatItem label="Total cards" count={d.totalCards} />
            <StatItem label="Unique printings" count={d.uniqueCards} />
            <StatItem
              label="Collection value"
              count={d.totalValueUsd}
              prefix="$"
              decimals={2}
              emphasis
              sub="Scryfall market price, USD"
            />
            {d.deckCount > 0 ? (
              <StatItem
                label="Decks"
                count={d.deckCount}
                sub={d.decksByFormat.map((b) => `${b.value} ${b.label}`).join(" · ")}
              />
            ) : (
              <StatItem
                label="Decks"
                value={<span className="text-base font-medium text-muted-foreground">No decks yet</span>}
                sub={<ActionLink href="/decks/new" className="text-xs">Create a deck</ActionLink>}
              />
            )}
          </StatRow>

          <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="space-y-10">
              <Section
                title="Recently added"
                actions={
                  <Link
                    href="/collection"
                    className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    View collection
                  </Link>
                }
              >
                <ul className="stagger -mx-2">
                  {d.recent.map((c, i) => (
                    <RecentRow key={`${c.name}-${c.setCode}-${c.foil}-${i}`} card={c} />
                  ))}
                </ul>
              </Section>

              {d.mostValuable.length > 0 && (
                <Section title="Most valuable" meta="per copy">
                  <ol className="-mx-2">
                    {d.mostValuable.map((c, i) => (
                      <ValuableRow key={`${c.name}-${c.setCode}-${c.foil}`} card={c} rank={i + 1} />
                    ))}
                  </ol>
                </Section>
              )}
            </div>

            <Surface className="h-fit divide-y divide-border self-start [&>section]:p-5">
              <Section title="Mana curve" meta="non-land cards">
                <ManaCurve data={d.manaCurve} />
              </Section>
              <Section title="Colour breakdown">
                <ColourBreakdown data={d.colorBreakdown} />
              </Section>
              <Section title="Rarity">
                <RarityBreakdown data={d.rarityBreakdown} />
              </Section>
            </Surface>
          </div>

          <div className="grid gap-x-12 gap-y-10 border-t border-border pt-8 md:grid-cols-2">
            <Section title="Card types">
              <BarList data={d.typeBreakdown} />
            </Section>
            <Section title="Top sets">
              <BarList data={d.topSets} label={(b) => <SetName code={b.label} />} />
            </Section>
          </div>
        </>
      )}
    </div>
  );
}

function RecentRow({ card: c }: { card: DashboardCard }) {
  return (
    <li className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50">
      <CardPreview uri={c.imageUri} name={c.name}>
        <span className="block">
          <CardThumb uri={c.imageUri} name={c.name} />
        </span>
      </CardPreview>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{c.name}</span>
          {c.foil && <FoilMark />}
          <span className="hidden sm:inline-flex">
            <ManaCost cost={c.manaCost} size={13} />
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <Printing setCode={c.setCode} collectorNumber={c.collectorNumber} rarity={c.rarity} />
          <span className="hidden truncate md:inline">{c.typeLine}</span>
        </div>
      </div>
      <span className="numeral shrink-0 text-sm text-muted-foreground">×{c.quantity}</span>
      <time
        dateTime={c.addedAt}
        title={new Date(c.addedAt).toLocaleString()}
        className="w-20 shrink-0 text-right text-xs text-faint-foreground"
      >
        {timeAgo(c.addedAt)}
      </time>
    </li>
  );
}

function ValuableRow({ card: c, rank }: { card: DashboardCard; rank: number }) {
  return (
    <li className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50">
      <span className="numeral w-4 shrink-0 text-right text-xs text-faint-foreground">{rank}</span>
      <CardPreview uri={c.imageUri} name={c.name}>
        <span className="block">
          <CardThumb uri={c.imageUri} name={c.name} />
        </span>
      </CardPreview>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{c.name}</span>
          {c.foil && <FoilMark />}
        </div>
        <Printing
          className="mt-0.5"
          setCode={c.setCode}
          collectorNumber={c.collectorNumber}
          rarity={c.rarity}
        />
      </div>
      {c.quantity > 1 && (
        <span className="numeral shrink-0 text-xs text-faint-foreground">×{c.quantity}</span>
      )}
      <span className="numeral w-20 shrink-0 text-right text-sm font-medium text-primary">
        {usd(c.priceUsd)}
      </span>
    </li>
  );
}

/** A set's symbol and full name, falling back to the code until names load. */
function SetName({ code }: { code: string }) {
  const sets = useSets();
  const name = sets?.[code]?.name;
  return (
    <span className="flex min-w-0 items-center gap-2" title={name ? `${name} (${code})` : code}>
      <SetSymbol code={code} rarity="common" size={14} className="text-muted-foreground" />
      <span className="truncate">{name ?? code}</span>
    </span>
  );
}

/** Mirrors the real layout, so nothing shifts when the data lands. */
function DashboardSkeleton() {
  return (
    <div className="space-y-10">
      <div className="grid grid-cols-2 gap-6 sm:flex sm:gap-14">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-3 w-20 rounded-full" />
            <Skeleton className="mt-2.5 h-7 w-16 rounded-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-12 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-8 w-11 rounded-[4px]" />
              <Skeleton className="h-3.5 flex-1 rounded-full" />
            </div>
          ))}
        </div>
        <Surface className="p-5">
          <SkeletonLines lines={6} />
        </Surface>
      </div>
    </div>
  );
}
