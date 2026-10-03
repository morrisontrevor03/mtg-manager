"use client";

import Link from "next/link";
import { BarChartCard, PieChartCard } from "@/components/charts";
import { EmptyState, LoadError, Panel, PageHeader, Skeleton, Stat } from "@/components/ui";
import { SparkIcon, WaveformIcon } from "@/components/icons";
import { useApi } from "@/lib/useApi";
import type { DashboardData } from "@/lib/aggregate";

export default function DashboardPage() {
  const { data: d, error, loading, reload } = useApi<DashboardData>("/api/dashboard");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        lead="Everything you own, at a glance."
        actions={
          <>
            <Link href="/collection/voice" className="btn btn-ghost text-sm">
              <WaveformIcon size={16} />
              Voice entry
            </Link>
            <Link href="/decks/new" className="btn text-sm">
              <SparkIcon size={14} />
              Build a deck
            </Link>
          </>
        }
      />

      {error ? (
        <LoadError message={error} onRetry={reload} />
      ) : loading || !d ? (
        <DashboardSkeleton />
      ) : d.totalCards === 0 ? (
        <EmptyState icon="🃏" title="Your collection is empty">
          Add cards from the{" "}
          <Link href="/collection" className="text-accent underline underline-offset-2">
            Collection page
          </Link>{" "}
          — type them in, paste a list, or just say them out loud.
        </EmptyState>
      ) : (
        <>
          <div className="stagger grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Total cards" count={d.totalCards} />
            <Stat label="Unique cards" count={d.uniqueCards} />
            <Stat
              label="Collection value"
              count={d.totalValueUsd}
              prefix="$"
              decimals={2}
              sub="Scryfall USD"
            />
            <Stat
              label="Decks"
              count={d.deckCount}
              sub={d.decksByFormat.map((b) => `${b.value} ${b.label}`).join(" · ") || "none yet"}
            />
          </div>

          <div className="stagger grid gap-4 lg:grid-cols-2">
            <Panel title="Colour breakdown" lift>
              <PieChartCard data={d.colorBreakdown} />
            </Panel>
            <Panel title="Mana curve" lift>
              <BarChartCard data={d.manaCurve} />
            </Panel>
            <Panel title="Card types" lift>
              <BarChartCard data={d.typeBreakdown} />
            </Panel>
            <Panel title="Rarity" lift>
              <PieChartCard data={d.rarityBreakdown} />
            </Panel>
          </div>

          <div className="stagger grid gap-4 lg:grid-cols-2">
            <Panel title="Top sets" lift>
              <ul className="space-y-2 text-sm">
                {d.topSets.map((s) => {
                  const max = d.topSets[0]?.value || 1;
                  return (
                    <li key={s.label} className="flex items-center gap-3">
                      <span className="w-12 shrink-0 font-mono text-xs text-muted">
                        {s.label}
                      </span>
                      {/* Proportion bar — cheaper to read than a number alone. */}
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <span
                          className="block h-full rounded-full bg-accent/70"
                          style={{ width: `${(s.value / max) * 100}%` }}
                        />
                      </span>
                      <span className="numeral w-8 shrink-0 text-right text-xs text-muted">
                        {s.value}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Panel>

            <Panel title="Recently added" lift>
              <ul className="divide-hairline text-sm">
                {d.recent.map((r, i) => (
                  <li key={i} className="flex items-baseline gap-2 py-1.5">
                    <span className="numeral text-muted">{r.quantity}×</span>
                    <span className="truncate">{r.name}</span>
                    <span className="font-mono text-[11px] text-muted-dim">{r.setCode}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-dim">
                      {new Date(r.addedAt).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

/** Mirrors the real layout, so nothing shifts when the data lands. */
function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-surface p-4">
            <div className="shimmer h-3 w-20 rounded-full" />
            <div className="shimmer mt-3 h-7 w-16 rounded-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Panel key={i} title="">
            <Skeleton lines={5} />
          </Panel>
        ))}
      </div>
    </div>
  );
}
