"use client";

import Link from "next/link";
import {
  Badge,
  ColorPips,
  EmptyState,
  LoadError,
  PageHeader,
  Panel,
  Skeleton,
} from "@/components/ui";
import { SparkIcon } from "@/components/icons";
import { useApi } from "@/lib/useApi";
import type { Color } from "@/lib/types";

/** The shape `GET /api/decks` returns, already aggregated server-side. */
interface ApiDeck {
  id: string;
  name: string;
  format: string;
  status: string;
  colors: Color[];
  cardCount: number;
  toAcquire: number;
  updatedAt: string;
}

export default function DecksPage() {
  const { data, error, loading, reload } = useApi<{ decks: ApiDeck[] }>("/api/decks");
  const decks = data?.decks ?? [];

  const grouped = {
    commander: decks.filter((d) => d.format === "commander"),
    standard: decks.filter((d) => d.format === "standard"),
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Decks"
        lead="Built from your collection, validated against format rules."
        actions={
          <Link href="/decks/new" className="btn text-sm">
            <SparkIcon size={14} />
            Build a deck
          </Link>
        }
      />

      {error ? (
        <LoadError message={error} onRetry={reload} />
      ) : loading && !data ? (
        <Panel title="Decks">
          <Skeleton lines={5} />
        </Panel>
      ) : decks.length === 0 ? (
        <EmptyState icon="⚔" title="No decks yet">
          Describe the deck you want and the model will build it from what you own —{" "}
          <Link href="/decks/new" className="text-accent underline underline-offset-2">
            give it a try
          </Link>
          .
        </EmptyState>
      ) : (
        <div className="stagger space-y-4">
          {(["commander", "standard"] as const).map((fmt) =>
            grouped[fmt].length ? (
              <Panel key={fmt} title={fmt === "commander" ? "Commander" : "Standard"}>
                <ul className="divide-hairline">
                  {grouped[fmt].map((d) => (
                    <li key={d.id}>
                      <Link
                        href={`/decks/view?id=${d.id}`}
                        className="group flex flex-wrap items-center gap-3 rounded-lg px-2 py-3 transition-colors duration-200 hover:bg-surface-2/70"
                      >
                        <ColorPips colors={d.colors ?? []} />
                        <span className="font-medium decoration-accent/60 underline-offset-2 group-hover:underline">
                          {d.name}
                        </span>
                        <span className="numeral text-xs text-muted">{d.cardCount} cards</span>
                        {d.toAcquire > 0 && <Badge tone="warn">{d.toAcquire} to acquire</Badge>}
                        <Badge tone={d.status === "final" ? "good" : "default"}>{d.status}</Badge>
                        <span className="ml-auto text-xs text-muted-dim">
                          {new Date(d.updatedAt).toLocaleDateString()}
                        </span>
                        <span
                          aria-hidden
                          className="text-muted-dim transition-transform duration-200 group-hover:translate-x-1"
                        >
                          →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
