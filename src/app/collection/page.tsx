"use client";

import Link from "next/link";
import { EmptyState, LoadError, Panel, PageHeader, Skeleton } from "@/components/ui";
import { WaveformIcon } from "@/components/icons";
import { AddCardForm } from "@/components/collection/AddCardForm";
import { ImportPanel } from "@/components/collection/ImportPanel";
import { CollectionTable, type Row } from "@/components/collection/CollectionTable";
import { useApi } from "@/lib/useApi";
import type { CardPrices } from "@/lib/types";

/** The shape `GET /api/collection` returns for each owned card. */
interface ApiItem {
  id: string;
  quantity: number;
  foil: boolean;
  card: {
    name: string;
    setCode: string;
    collectorNumber: string;
    typeLine: string;
    manaCost: string;
    rarity: string;
    colors: string[];
    prices: CardPrices;
    scryfallUri: string;
  };
}

interface ApiResponse {
  total: number;
  items: ApiItem[];
}

// The page used to load every row straight from Prisma. The API paginates, so
// ask for the largest page it allows and tell the truth if a collection somehow
// outgrows it, rather than silently showing a subset.
const PAGE_SIZE = 500;

function toRow(it: ApiItem): Row {
  const p = it.card.prices;
  const raw = it.foil ? p.usd_foil ?? p.usd : p.usd;
  return {
    id: it.id,
    name: it.card.name,
    setCode: it.card.setCode,
    collectorNumber: it.card.collectorNumber,
    typeLine: it.card.typeLine,
    manaCost: it.card.manaCost,
    rarity: it.card.rarity,
    colors: it.card.colors ?? [],
    quantity: it.quantity,
    foil: it.foil,
    priceUsd: parseFloat(raw ?? "") || 0,
    scryfallUri: it.card.scryfallUri,
  };
}

export default function CollectionPage() {
  const { data, error, loading, reload } = useApi<ApiResponse>(
    `/api/collection?take=${PAGE_SIZE}`,
  );

  const rows: Row[] = (data?.items ?? []).map(toRow);
  const totalCopies = rows.reduce((n, r) => n + r.quantity, 0);
  const totalValue = rows.reduce((n, r) => n + r.quantity * r.priceUsd, 0);
  const truncated = data ? data.total > rows.length : false;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Collection"
        lead="Add cards by hand, paste a list, or announce them out loud."
        actions={
          <Link href="/collection/voice" className="btn text-sm">
            <WaveformIcon size={16} />
            Voice entry
          </Link>
        }
      />

      <div className="stagger grid gap-4 lg:grid-cols-2">
        <Panel title="Add a card" lift>
          <AddCardForm onChanged={reload} />
        </Panel>
        <Panel title="Import a list" lift>
          <ImportPanel onChanged={reload} />
        </Panel>
      </div>

      {error ? (
        <LoadError message={error} onRetry={reload} />
      ) : loading && !data ? (
        <Panel title="Your cards">
          <Skeleton lines={8} />
        </Panel>
      ) : rows.length === 0 ? (
        <EmptyState icon="📥" title="Nothing here yet">
          Add your first card above, or import{" "}
          <code className="font-mono">sample-collection.csv</code> to try things out.
        </EmptyState>
      ) : (
        <Panel
          title="Your cards"
          actions={
            <div className="flex items-baseline gap-3 text-xs text-muted">
              <span>
                <span className="numeral text-foreground">{rows.length}</span> unique
              </span>
              <span>
                <span className="numeral text-foreground">{totalCopies}</span> copies
              </span>
              <span className="numeral text-accent">${totalValue.toFixed(2)}</span>
            </div>
          }
        >
          {truncated && (
            <p className="mb-3 text-xs text-muted">
              Showing the first <span className="numeral">{rows.length}</span> of{" "}
              <span className="numeral">{data?.total}</span> cards.
            </p>
          )}
          <CollectionTable rows={rows} onChanged={reload} refreshing={loading} />
        </Panel>
      )}
    </div>
  );
}
