"use client";

import Link from "next/link";
import { ChevronRightIcon, SwordsIcon } from "lucide-react";
import {
  ActionLink,
  EmptyState,
  LoadError,
  PageHeader,
  Section,
  SkeletonLines,
} from "@/components/patterns";
import { CardThumb, ColorIdentity } from "@/components/mtg";
import { SparkIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useApi } from "@/lib/useApi";
import { timeAgo } from "@/lib/timeAgo";
import type { Color } from "@/lib/types";

/** The shape `GET /api/decks` returns, already aggregated server-side. */
interface ApiDeck {
  id: string;
  name: string;
  format: string;
  status: string;
  colors: Color[];
  commander: { name: string; imageUri: string } | null;
  cardCount: number;
  toAcquire: number;
  updatedAt: string;
}

const FORMATS = [
  { key: "commander", title: "Commander" },
  { key: "standard", title: "Standard" },
] as const;

export default function DecksPage() {
  const { data, error, loading, reload } = useApi<{ decks: ApiDeck[] }>("/api/decks");
  const decks = data?.decks ?? [];

  return (
    <div className="space-y-10">
      <PageHeader
        title="Decks"
        lead={
          decks.length > 0
            ? "Built from your collection and checked against format rules."
            : undefined
        }
        actions={
          <Button asChild>
            <Link href="/decks/new">
              <SparkIcon size={14} />
              Build a deck
            </Link>
          </Button>
        }
      />

      {error ? (
        <LoadError message={error} onRetry={reload} />
      ) : loading && !data ? (
        <SkeletonLines lines={5} />
      ) : decks.length === 0 ? (
        <EmptyState
          icon={<SwordsIcon />}
          title="No decks yet"
          action={<ActionLink href="/decks/new">Create a deck</ActionLink>}
        >
          Build your first deck from cards you already own. Describe how it should play; anything
          missing is flagged as a card to acquire.
        </EmptyState>
      ) : (
        FORMATS.map(({ key, title }) => {
          const list = decks.filter((d) => d.format === key);
          if (!list.length) return null;
          return (
            <Section key={key} title={title} meta={`${list.length} ${list.length === 1 ? "deck" : "decks"}`}>
              <ul className="stagger divide-y divide-border/60 border-y border-border/60">
                {list.map((d) => (
                  <li key={d.id}>
                    <DeckRow deck={d} />
                  </li>
                ))}
              </ul>
            </Section>
          );
        })
      )}
    </div>
  );
}

function DeckRow({ deck: d }: { deck: ApiDeck }) {
  return (
    <Link
      href={`/decks/view?id=${d.id}`}
      className="group flex items-center gap-4 px-2 py-3 transition-colors duration-200 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
    >
      {d.commander?.imageUri ? (
        <CardThumb uri={d.commander.imageUri} name={d.commander.name} className="h-11 w-16" />
      ) : (
        <span className="flex h-11 w-16 shrink-0 items-center justify-center rounded-[4px] bg-muted">
          <ColorIdentity colors={d.colors ?? []} size={13} />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <span className="truncate font-medium decoration-primary/60 underline-offset-4 group-hover:underline">
            {d.name}
          </span>
          {d.commander && (
            <span className="hidden sm:inline-flex">
              <ColorIdentity colors={d.colors ?? []} size={14} />
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {d.commander && <span className="truncate">{d.commander.name}</span>}
          {d.commander && <span aria-hidden className="text-faint-foreground">·</span>}
          <span className="numeral">{d.cardCount} cards</span>
          {d.toAcquire > 0 && (
            <>
              <span aria-hidden className="text-faint-foreground">·</span>
              <span className="text-primary">
                <span className="numeral">{d.toAcquire}</span> to acquire
              </span>
            </>
          )}
        </div>
      </div>

      <span
        className={
          d.status === "final"
            ? "hidden text-xs text-success sm:inline"
            : "hidden text-xs text-faint-foreground sm:inline"
        }
      >
        {d.status === "final" ? "Final" : "Draft"}
      </span>
      <time
        dateTime={d.updatedAt}
        title={`Updated ${new Date(d.updatedAt).toLocaleString()}`}
        className="hidden w-24 text-right text-xs text-faint-foreground md:inline"
      >
        {timeAgo(d.updatedAt)}
      </time>
      <ChevronRightIcon
        aria-hidden
        className="size-4 shrink-0 text-faint-foreground transition-transform duration-200 group-hover:translate-x-0.5"
      />
    </Link>
  );
}
