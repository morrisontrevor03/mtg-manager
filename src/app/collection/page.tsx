"use client";

import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileTextIcon, LayersIcon, PencilLineIcon } from "lucide-react";
import { EmptyState, LoadError, PageHeader } from "@/components/patterns";
import { WaveformIcon } from "@/components/icons";
import { AddCardsMenu, type AddMode } from "@/components/collection/AddCards";
import { CollectionList, type Row } from "@/components/collection/CollectionList";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/useApi";
import type { CardPrices } from "@/lib/types";

/** The shape `GET /api/collection` returns for each owned card. */
interface ApiItem {
  id: string;
  quantity: number;
  foil: boolean;
  condition: string;
  addedAt: string;
  card: {
    name: string;
    setCode: string;
    collectorNumber: string;
    typeLine: string;
    manaCost: string;
    cmc: number;
    oracleText: string;
    rarity: string;
    colors: string[];
    imageUri: string;
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

const num = (raw?: string | null) => parseFloat(raw ?? "") || 0;

function toRow(it: ApiItem): Row {
  const p = it.card.prices;
  const prices = { usd: num(p.usd), usdFoil: num(p.usd_foil) };
  return {
    id: it.id,
    name: it.card.name,
    setCode: it.card.setCode,
    collectorNumber: it.card.collectorNumber,
    typeLine: it.card.typeLine,
    manaCost: it.card.manaCost,
    cmc: it.card.cmc ?? 0,
    oracleText: it.card.oracleText ?? "",
    rarity: it.card.rarity,
    colors: it.card.colors ?? [],
    quantity: it.quantity,
    foil: it.foil,
    condition: it.condition,
    priceUsd: it.foil ? prices.usdFoil || prices.usd : prices.usd,
    prices,
    imageUri: it.card.imageUri,
    scryfallUri: it.card.scryfallUri,
    addedAt: it.addedAt,
  };
}

const usd = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2 });

function CollectionView() {
  const { data, error, loading, reload } = useApi<ApiResponse>(
    `/api/collection?take=${PAGE_SIZE}`,
  );

  // `?add=voice` (from the dashboard) opens a tool on arrival. The parameter is
  // dropped once the tool closes, so a refresh does not reopen it.
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [mode, setModeState] = useState<AddMode | null>(() => {
    const requested = params.get("add");
    return requested === "voice" || requested === "manual" || requested === "import"
      ? requested
      : null;
  });
  const setMode = (next: AddMode | null) => {
    setModeState(next);
    if (!next && params.has("add")) router.replace(pathname);
  };

  const rows: Row[] = (data?.items ?? []).map(toRow);
  const totalCopies = rows.reduce((n, r) => n + r.quantity, 0);
  const totalValue = rows.reduce((n, r) => n + r.quantity * r.priceUsd, 0);
  const truncated = data ? data.total > rows.length : false;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Collection"
        lead={
          rows.length > 0 ? (
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span>
                <span className="numeral text-foreground">{totalCopies.toLocaleString()}</span>{" "}
                cards
              </span>
              <span aria-hidden className="text-faint-foreground">
                ·
              </span>
              <span>
                <span className="numeral text-foreground">{rows.length.toLocaleString()}</span>{" "}
                unique
              </span>
              <span aria-hidden className="text-faint-foreground">
                ·
              </span>
              <span className="numeral font-medium text-primary">{usd(totalValue)}</span>
            </span>
          ) : undefined
        }
        actions={<AddCardsMenu mode={mode} onModeChange={setMode} onChanged={reload} />}
      />

      {error ? (
        <LoadError message={error} onRetry={reload} />
      ) : loading && !data ? (
        <ListSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<LayersIcon />}
          title="No cards yet"
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setMode("manual")}>
                <PencilLineIcon />
                Add manually
              </Button>
              <Button variant="outline" size="sm" onClick={() => setMode("import")}>
                <FileTextIcon />
                Import list
              </Button>
              <Button variant="outline" size="sm" onClick={() => setMode("voice")}>
                <WaveformIcon size={15} />
                Voice entry
              </Button>
            </div>
          }
        >
          Start with the cards in front of you: search one by name, paste a list exported from
          another app, or read a stack out loud.
        </EmptyState>
      ) : (
        <>
          {truncated && (
            <p className="text-xs text-muted-foreground">
              Showing the first <span className="numeral">{rows.length}</span> of{" "}
              <span className="numeral">{data?.total}</span> printings.
            </p>
          )}
          <CollectionList rows={rows} onChanged={reload} refreshing={loading} />
        </>
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-72 rounded-sm" />
        <Skeleton className="h-9 w-56 rounded-md" />
      </div>
      <div className="divide-y divide-border/60">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-2.5">
            <Skeleton className="h-8 w-11 rounded-[4px]" />
            <Skeleton className="h-3.5 rounded-full" style={{ width: `${40 - (i % 3) * 7}%` }} />
            <Skeleton className="ml-auto h-3.5 w-14 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CollectionPage() {
  // `useSearchParams` needs a Suspense boundary to prerender during export.
  return (
    <Suspense fallback={<ListSkeleton />}>
      <CollectionView />
    </Suspense>
  );
}
