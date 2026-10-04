"use client";

import { useMemo, useState } from "react";
import { cn } from "cn";
import { ExternalLinkIcon, MinusIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import {
  CardPreview,
  CardThumb,
  FoilMark,
  ManaCost,
  ManaSymbol,
  Printing,
  SetSymbol,
} from "@/components/mtg";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { apiFetch } from "@/lib/authClient";
import { rarityLabel } from "@/lib/scryfallAssets";
import { timeAgo } from "@/lib/timeAgo";
import { useSets } from "@/lib/useSets";

export interface Row {
  id: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  typeLine: string;
  manaCost: string;
  cmc: number;
  oracleText: string;
  rarity: string;
  colors: string[];
  quantity: number;
  foil: boolean;
  condition: string;
  /** Single-copy price for this finish; 0 when Scryfall has none. */
  priceUsd: number;
  /** Both finishes, for the detail drawer. */
  prices: { usd: number; usdFoil: number };
  imageUri: string;
  scryfallUri: string;
  addedAt: string;
}

const usd = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2 });

// --- Filtering and sorting ---------------------------------------------------

type SortKey = "name" | "value" | "quantity" | "cmc" | "set" | "added";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "value", label: "Price, high to low" },
  { key: "quantity", label: "Quantity" },
  { key: "cmc", label: "Mana value" },
  { key: "set", label: "Set and number" },
  { key: "added", label: "Recently added" },
];

const COMPARE: Record<SortKey, (a: Row, b: Row) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  value: (a, b) => b.priceUsd - a.priceUsd,
  quantity: (a, b) => b.quantity - a.quantity,
  cmc: (a, b) => a.cmc - b.cmc,
  set: (a, b) =>
    a.setCode.localeCompare(b.setCode) ||
    a.collectorNumber.localeCompare(b.collectorNumber, undefined, { numeric: true }),
  added: (a, b) => b.addedAt.localeCompare(a.addedAt),
};

/** Colour filter values: the five colours, plus colourless and multicolour. */
const COLOUR_FILTERS = ["W", "U", "B", "R", "G", "C", "M"] as const;
type ColourFilter = (typeof COLOUR_FILTERS)[number];

function matchesColour(r: Row, wanted: ColourFilter[]): boolean {
  if (wanted.length === 0) return true;
  return wanted.some((w) =>
    w === "C" ? r.colors.length === 0 : w === "M" ? r.colors.length > 1 : r.colors.includes(w),
  );
}

const ANY = "__any";

// --- List ----------------------------------------------------------------------

export function CollectionList({
  rows,
  onChanged,
  refreshing = false,
}: {
  rows: Row[];
  onChanged?: () => void;
  /** The owning page is re-fetching, so the rows on screen are briefly stale. */
  refreshing?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [colours, setColours] = useState<ColourFilter[]>([]);
  const [rarity, setRarity] = useState(ANY);
  const [foilOnly, setFoilOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("name");
  const [openId, setOpenId] = useState<string | null>(null);

  // Quantity edits show immediately. Each override remembers the quantity it
  // was made against, so it falls away by itself once the reload lands.
  const [pendingQty, setPendingQty] = useState<Record<string, { from: number; to: number }>>({});
  const qtyOf = (r: Row) => {
    const p = pendingQty[r.id];
    return p && p.from === r.quantity ? p.to : r.quantity;
  };

  async function setQuantity(r: Row, quantity: number) {
    const next = Math.max(0, quantity);
    setPendingQty((prev) => ({ ...prev, [r.id]: { from: r.quantity, to: next } }));
    await apiFetch(`/api/collection/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: next }),
    });
    onChanged?.();
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter(
        (r) =>
          (!q ||
            r.name.toLowerCase().includes(q) ||
            r.typeLine.toLowerCase().includes(q) ||
            r.setCode.toLowerCase() === q) &&
          matchesColour(r, colours) &&
          (rarity === ANY || r.rarity === rarity) &&
          (!foilOnly || r.foil),
      )
      .sort(COMPARE[sort]);
  }, [rows, query, colours, rarity, foilOnly, sort]);

  const filtered = visible.length !== rows.length;
  const clear = () => {
    setQuery("");
    setColours([]);
    setRarity(ANY);
    setFoilOnly(false);
  };

  const open = openId ? rows.find((r) => r.id === openId) : undefined;

  return (
    <div>
      {/* Toolbar ----------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint-foreground"
          />
          <Input
            className="pl-8"
            aria-label="Search your cards"
            placeholder="Search name, type or set code"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <ToggleGroup
          type="multiple"
          size="sm"
          value={colours}
          onValueChange={(v) => setColours(v as ColourFilter[])}
          aria-label="Filter by colour"
          className="rounded-md bg-muted/60 p-0.5"
        >
          {COLOUR_FILTERS.map((c) => (
            <ToggleGroupItem
              key={c}
              value={c}
              aria-label={c === "M" ? "Multicolour" : `Colour ${c}`}
              title={c === "M" ? "Multicolour" : c === "C" ? "Colourless" : undefined}
              className="size-7 min-w-7 px-0 opacity-45 transition-opacity hover:bg-transparent hover:opacity-80 data-[state=on]:bg-transparent data-[state=on]:opacity-100"
            >
              {c === "M" ? (
                <span
                  aria-hidden
                  className="size-4 rounded-full ring-1 ring-black/30"
                  style={{
                    background:
                      "conic-gradient(from 200deg, #efe6c9, #5a9bd8, #8a7f73, #d65e43, #6fa25c, #efe6c9)",
                  }}
                />
              ) : (
                <ManaSymbol symbol={c} size={16} className="pointer-events-none" />
              )}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <Select value={rarity} onValueChange={setRarity}>
          <SelectTrigger size="sm" className="w-36" aria-label="Filter by rarity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All rarities</SelectItem>
            {["common", "uncommon", "rare", "mythic"].map((r) => (
              <SelectItem key={r} value={r}>
                <SetSymbol rarity={r} size={13} />
                {rarityLabel(r)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Toggle
          size="sm"
          variant="outline"
          pressed={foilOnly}
          onPressedChange={setFoilOnly}
          className="h-8 px-2.5 text-xs"
        >
          Foils only
        </Toggle>

        <div className="flex items-center gap-2 sm:ml-auto">
          <span className="hidden text-xs text-faint-foreground lg:inline">Sort</span>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger size="sm" className="w-44" aria-label="Sort by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-3 flex h-5 items-center gap-3 text-xs text-muted-foreground">
        {filtered ? (
          <>
            <span>
              <span className="numeral text-foreground">{visible.length}</span> of{" "}
              <span className="numeral">{rows.length}</span> printings
            </span>
            <button
              type="button"
              onClick={clear}
              className="inline-flex items-center gap-0.5 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              <XIcon className="size-3" />
              Clear filters
            </button>
          </>
        ) : (
          <span>
            <span className="numeral">{rows.length}</span> printings
          </span>
        )}
        {refreshing && <span className="ml-auto text-faint-foreground">Updating…</span>}
      </div>

      {/* Rows -------------------------------------------------------------- */}
      <div role="table" aria-label="Your cards" className="mt-2">
        <div
          role="row"
          className="hidden grid-cols-[2.75rem_minmax(0,1fr)_7.5rem_9rem_5.5rem_5.5rem] gap-x-4 border-b border-border px-2 pb-2 text-xs text-faint-foreground md:grid"
        >
          <span role="columnheader" className="sr-only">
            Art
          </span>
          <span role="columnheader" className="col-start-2">
            Card
          </span>
          <span role="columnheader">Cost</span>
          <span role="columnheader">Printing</span>
          <span role="columnheader" className="text-center">
            Qty
          </span>
          <span role="columnheader" className="text-right">
            Price
          </span>
        </div>

        <div role="rowgroup" className="divide-y divide-border/60">
          {visible.map((r) => (
            <CollectionRow
              key={r.id}
              row={r}
              quantity={qtyOf(r)}
              onOpen={() => setOpenId(r.id)}
              onQuantity={(q) => void setQuantity(r, q)}
            />
          ))}
        </div>

        {visible.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No cards match these filters.{" "}
            <button
              type="button"
              onClick={clear}
              className="text-primary underline-offset-2 hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      <CardDrawer
        row={open}
        quantity={open ? qtyOf(open) : 0}
        onClose={() => setOpenId(null)}
        onQuantity={(q) => open && void setQuantity(open, q)}
      />
    </div>
  );
}

// --- One row -----------------------------------------------------------------

function CollectionRow({
  row: r,
  quantity,
  onOpen,
  onQuantity,
}: {
  row: Row;
  quantity: number;
  onOpen: () => void;
  onQuantity: (q: number) => void;
}) {
  return (
    <div
      role="row"
      onClick={onOpen}
      className={cn(
        "group grid cursor-pointer grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-x-3 px-2 py-2 transition-colors hover:bg-muted/50 md:grid-cols-[2.75rem_minmax(0,1fr)_7.5rem_9rem_5.5rem_5.5rem] md:gap-x-4",
        quantity === 0 && "opacity-40",
      )}
    >
      <span role="cell">
        <CardPreview uri={r.imageUri} name={r.name}>
          <span className="block">
            <CardThumb uri={r.imageUri} name={r.name} />
          </span>
        </CardPreview>
      </span>

      <span role="cell" className="min-w-0">
        <span className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            className="truncate rounded-sm text-left font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {r.name}
          </button>
          {r.foil && <FoilMark />}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{r.typeLine}</span>
          {/* On narrow screens the cost and printing fold under the name. */}
          <span className="inline-flex shrink-0 items-center gap-2 md:hidden">
            <ManaCost cost={r.manaCost} size={12} />
            <Printing setCode={r.setCode} rarity={r.rarity} showSymbol />
          </span>
        </span>
      </span>

      <span role="cell" className="hidden md:block">
        <ManaCost cost={r.manaCost} size={15} />
      </span>

      <span role="cell" className="hidden md:block" onClick={(e) => e.stopPropagation()}>
        <Printing setCode={r.setCode} collectorNumber={r.collectorNumber} rarity={r.rarity} />
      </span>

      <span
        role="cell"
        className="hidden items-center justify-center gap-0.5 md:flex"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Steppers appear on hover or focus so the column reads as numbers at rest. */}
        <Button
          variant="ghost"
          size="icon-xs"
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          onClick={() => onQuantity(quantity - 1)}
          aria-label={`Remove one ${r.name}`}
        >
          <MinusIcon />
        </Button>
        <span className="numeral w-7 text-center text-sm">×{quantity}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          onClick={() => onQuantity(quantity + 1)}
          aria-label={`Add one ${r.name}`}
        >
          <PlusIcon />
        </Button>
      </span>

      <span role="cell" className="text-right">
        <span
          className="numeral block text-sm"
          title={r.priceUsd && quantity > 1 ? `${usd(r.priceUsd * quantity)} for ${quantity}` : undefined}
        >
          {r.priceUsd ? usd(r.priceUsd) : <span className="text-faint-foreground">—</span>}
        </span>
        <span className="numeral block text-xs text-faint-foreground md:hidden">×{quantity}</span>
      </span>
    </div>
  );
}

// --- Detail drawer -----------------------------------------------------------

/** Oracle text with `{T}`, `{R}` and friends drawn as symbols. */
function OracleText({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-foreground/90">
      {text.split("\n").map((para, i) => (
        <p key={i}>
          {para.split(/(\{[^}]+\})/g).map((part, j) =>
            /^\{[^}]+\}$/.test(part) ? (
              <ManaSymbol key={j} symbol={part.slice(1, -1)} size={14} className="mx-px -mt-0.5 align-middle" />
            ) : (
              part
            ),
          )}
        </p>
      ))}
    </div>
  );
}

function CardDrawer({
  row: r,
  quantity,
  onClose,
  onQuantity,
}: {
  row?: Row;
  quantity: number;
  onClose: () => void;
  onQuantity: (q: number) => void;
}) {
  const sets = useSets();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const set = r ? sets?.[r.setCode] : undefined;

  return (
    <Dialog
      open={Boolean(r)}
      onOpenChange={(o) => {
        if (!o) {
          setConfirmRemove(false);
          onClose();
        }
      }}
    >
      <DialogContent side="right" className="gap-0">
        {r && (
          <>
            <div className="bg-background/60 px-10 pt-10 pb-6">
              <CardThumb
                uri={r.imageUri}
                name={r.name}
                variant="card"
                className="mx-auto max-w-[17rem] shadow-[0_28px_56px_-20px_rgba(0,0,0,0.95)]"
              />
            </div>

            <div className="space-y-6 px-6 pt-5 pb-8">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <DialogTitle className="display text-2xl leading-tight">{r.name}</DialogTitle>
                  <span className="mt-1.5 shrink-0">
                    <ManaCost cost={r.manaCost} size={17} />
                  </span>
                </div>
                <DialogDescription className="mt-1 flex items-center gap-2">
                  {r.typeLine}
                  {r.foil && <FoilMark />}
                </DialogDescription>
              </div>

              {r.oracleText && <OracleText text={r.oracleText} />}

              <dl className="grid grid-cols-[7rem_1fr] gap-y-2.5 border-t border-border pt-5 text-sm">
                <dt className="text-muted-foreground">Set</dt>
                <dd className="flex min-w-0 items-center gap-2">
                  <SetSymbol code={r.setCode} rarity={r.rarity} size={16} />
                  <span className="truncate">{set?.name ?? r.setCode}</span>
                  <span className="meta">{r.setCode}</span>
                </dd>
                <dt className="text-muted-foreground">Collector no.</dt>
                <dd className="numeral">#{r.collectorNumber}</dd>
                <dt className="text-muted-foreground">Rarity</dt>
                <dd>{rarityLabel(r.rarity)}</dd>
                <dt className="text-muted-foreground">Finish</dt>
                <dd>{r.foil ? "Foil" : "Non-foil"}</dd>
                <dt className="text-muted-foreground">Condition</dt>
                <dd>{r.condition || "NM"}</dd>
                <dt className="text-muted-foreground">Added</dt>
                <dd title={new Date(r.addedAt).toLocaleString()}>{timeAgo(r.addedAt)}</dd>
              </dl>

              <div className="grid grid-cols-[7rem_1fr] items-center gap-y-3 border-t border-border pt-5 text-sm">
                <span className="text-muted-foreground">Price each</span>
                <span className="numeral">
                  {r.priceUsd ? usd(r.priceUsd) : "—"}
                  {r.foil && r.prices.usd > 0 && (
                    <span className="ml-2 text-xs text-faint-foreground">
                      non-foil {usd(r.prices.usd)}
                    </span>
                  )}
                  {!r.foil && r.prices.usdFoil > 0 && (
                    <span className="ml-2 text-xs text-faint-foreground">
                      foil {usd(r.prices.usdFoil)}
                    </span>
                  )}
                </span>

                <span className="text-muted-foreground">Quantity</span>
                <span className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon-xs"
                    disabled={quantity <= 1}
                    onClick={() => onQuantity(quantity - 1)}
                    aria-label="Remove one copy"
                  >
                    <MinusIcon />
                  </Button>
                  <span className="numeral w-8 text-center">{quantity}</span>
                  <Button
                    variant="outline"
                    size="icon-xs"
                    onClick={() => onQuantity(quantity + 1)}
                    aria-label="Add one copy"
                  >
                    <PlusIcon />
                  </Button>
                </span>

                <span className="text-muted-foreground">Value</span>
                <span className="numeral text-base font-semibold text-primary">
                  {r.priceUsd ? usd(r.priceUsd * quantity) : "—"}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-5">
                <Button asChild variant="outline" size="sm">
                  <a href={r.scryfallUri} target="_blank" rel="noopener noreferrer">
                    View on Scryfall
                    <ExternalLinkIcon />
                  </a>
                </Button>
                {confirmRemove ? (
                  <span className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      Remove {quantity === 1 ? "this copy" : `all ${quantity} copies`}?
                    </span>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        onQuantity(0);
                        setConfirmRemove(false);
                        onClose();
                      }}
                    >
                      Remove
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(false)}>
                      Keep
                    </Button>
                  </span>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto hover:text-destructive"
                    onClick={() => setConfirmRemove(true)}
                  >
                    Remove from collection
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
