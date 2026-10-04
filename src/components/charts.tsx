"use client";

/*
 * Collection analytics, drawn as compact HTML rather than a chart library: a
 * deck-builder's mana curve, a colour breakdown keyed by mana symbols, and a
 * rarity distribution keyed by expansion symbols. They are small multiples of
 * the same idea (count + share), so they stay dense and read at a glance.
 *
 * Colours here are game data (mana, rarity), not theme accents. Amber is not
 * used: it is reserved for actions and value.
 */
import type { CSSProperties, ReactNode } from "react";
import { cn } from "cn";
import type { Bucket } from "@/lib/aggregate";
import { ManaSymbol, SetSymbol, rarityColor } from "@/components/mtg";
import { rarityLabel } from "@/lib/scryfallAssets";

const pct = (value: number, total: number) => {
  if (!total) return "0%";
  const p = (value / total) * 100;
  return p > 0 && p < 1 ? "<1%" : `${Math.round(p)}%`;
};

const sum = (data: Bucket[]) => data.reduce((n, d) => n + d.value, 0);

// --- Mana curve --------------------------------------------------------------

/**
 * Non-land cards by mana value, labelled with the generic mana symbols a deck
 * builder would use. Every column from 1 to 7+ is always present.
 */
export function ManaCurve({ data }: { data: Bucket[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure className="m-0">
      <div className="flex h-28 items-end gap-1.5" role="list" aria-label="Mana curve">
        {data.map((d) => {
          const h = d.value ? Math.max(4, (d.value / max) * 100) : 0;
          return (
            <div
              key={d.label}
              role="listitem"
              aria-label={`Mana value ${d.label}: ${d.value} cards`}
              className="group flex h-full flex-1 flex-col items-center justify-end"
            >
              <span className="numeral mb-1 text-[11px] text-muted-foreground transition-colors group-hover:text-foreground">
                {d.value || ""}
              </span>
              <span
                className="w-full max-w-9 rounded-t-[3px] bg-muted-foreground/30 transition-colors duration-200 group-hover:bg-muted-foreground/55"
                style={{ height: `${h}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1.5 border-t border-border pt-2">
        {data.map((d) => (
          <span key={d.label} className="flex flex-1 items-center justify-center">
            <ManaSymbol symbol={d.label.replace("+", "")} size={15} />
            {d.label.endsWith("+") && (
              <span className="ml-px text-[10px] text-muted-foreground">+</span>
            )}
          </span>
        ))}
      </div>
    </figure>
  );
}

// --- Colour ------------------------------------------------------------------

/** Mana colours as printed, warmed slightly to sit on charcoal. */
const MANA_HEX: Record<string, string> = {
  White: "#efe6c9",
  Blue: "#5a9bd8",
  Black: "#8a7f73",
  Red: "#d65e43",
  Green: "#6fa25c",
  Colorless: "#a89c88",
};

const MANA_SYMBOL: Record<string, string> = {
  White: "W",
  Blue: "U",
  Black: "B",
  Red: "R",
  Green: "G",
  Colorless: "C",
};

const MULTI_GRADIENT =
  "conic-gradient(from 200deg, #efe6c9, #5a9bd8, #8a7f73, #d65e43, #6fa25c, #efe6c9)";

/** Gold multicolour has no symbol of its own; a WUBRG disc stands in. */
function MulticolorDisc({ size = 16 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full shadow-[0_1px_0_rgba(0,0,0,0.55)] ring-1 ring-black/30"
      style={{ width: size, height: size, background: MULTI_GRADIENT }}
    />
  );
}

function swatch(label: string): CSSProperties {
  return label === "Multicolor"
    ? { background: MULTI_GRADIENT }
    : { background: MANA_HEX[label] ?? "#a89c88" };
}

/**
 * A segmented strip showing the whole collection's colour mix, then one row
 * per colour with its symbol, count and share.
 */
export function ColourBreakdown({ data }: { data: Bucket[] }) {
  const total = sum(data);
  const present = data.filter((d) => d.value > 0);
  return (
    <div>
      <Strip data={present} total={total} styleFor={(d) => swatch(d.label)} />
      <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm min-[420px]:grid-cols-2">
        {present.map((d) => (
          <li key={d.label} className="flex items-center gap-2">
            {d.label === "Multicolor" ? (
              <MulticolorDisc />
            ) : (
              <ManaSymbol symbol={MANA_SYMBOL[d.label] ?? "C"} size={16} />
            )}
            <span className="truncate">{d.label === "Multicolor" ? "Multicolour" : d.label}</span>
            <span className="numeral ml-auto text-muted-foreground">{d.value}</span>
            <span className="numeral w-9 text-right text-xs text-faint-foreground">
              {pct(d.value, total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Rarity ------------------------------------------------------------------

/** Common → mythic as expansion symbols in their printed colours. */
export function RarityBreakdown({ data }: { data: Bucket[] }) {
  const total = sum(data);
  const shown = data.filter(
    (d) => ["common", "uncommon", "rare", "mythic"].includes(d.label) || d.value > 0,
  );
  return (
    <div>
      <Strip data={shown} total={total} styleFor={(d) => ({ background: rarityColor(d.label) })} />
      <ul className="mt-3 grid grid-cols-2 gap-y-3 sm:grid-cols-4">
        {shown.map((d) => (
          <li key={d.label} className="min-w-0">
            <div className="flex items-center gap-1.5">
              <SetSymbol rarity={d.label} size={14} />
              <span className="truncate text-xs text-muted-foreground">
                {d.label === "mythic" ? "Mythic" : rarityLabel(d.label)}
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="numeral text-lg leading-none font-semibold">{d.value}</span>
              <span className="numeral text-xs text-faint-foreground">{pct(d.value, total)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Shared ------------------------------------------------------------------

/** A thin proportional strip: the composition of the whole, at a glance. */
function Strip({
  data,
  total,
  styleFor,
}: {
  data: Bucket[];
  total: number;
  styleFor: (d: Bucket) => CSSProperties;
}) {
  if (!total) return <div className="h-1.5 rounded-full bg-muted" />;
  return (
    <div className="flex h-1.5 gap-[2px] overflow-hidden rounded-full" aria-hidden>
      {data.map((d) => (
        <span
          key={d.label}
          className="h-full first:rounded-l-full last:rounded-r-full"
          style={{ ...styleFor(d), width: `${(d.value / total) * 100}%` }}
        />
      ))}
    </div>
  );
}

/**
 * Ranked rows with a quiet proportion bar — for card types and sets, where the
 * labels matter more than the shape.
 */
export function BarList({
  data,
  label,
  className,
}: {
  data: Bucket[];
  /** Render a richer label than the bucket's text (e.g. a set symbol). */
  label?: (d: Bucket) => ReactNode;
  className?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className={cn("space-y-2 text-sm", className)}>
      {data.map((d) => (
        <li key={d.label} className="grid grid-cols-[minmax(0,8.5rem)_1fr_2.5rem] items-center gap-3">
          <span className="min-w-0 truncate">{label ? label(d) : d.label}</span>
          <span className="h-1 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-muted-foreground/45"
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </span>
          <span className="numeral text-right text-xs text-muted-foreground">{d.value}</span>
        </li>
      ))}
    </ul>
  );
}
