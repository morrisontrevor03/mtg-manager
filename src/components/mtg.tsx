"use client";

/* eslint-disable @next/next/no-img-element --
 * Symbols are tiny SVGs and thumbnails are already-sized Scryfall crops served
 * from a CDN. Plain lazy <img> avoids routing hundreds of rows through the
 * image optimiser, which a static export does not have anyway.
 */

/*
 * The parts of the UI that are specifically Magic: real mana symbols, set
 * symbols tinted by rarity, card art, and collector metadata. Pages use these
 * instead of generic chips so the app reads as a card catalogue.
 */
import type { CSSProperties, ReactNode } from "react";
import { cn } from "cn";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  cardImage,
  parseManaCost,
  rarityLabel,
  setIconFallback,
  symbolUrl,
} from "@/lib/scryfallAssets";
import { useSets } from "@/lib/useSets";

// --- Mana ------------------------------------------------------------------

export function ManaSymbol({
  symbol,
  size = 16,
  className,
}: {
  symbol: string;
  size?: number;
  className?: string;
}) {
  return (
    <img
      src={symbolUrl(symbol)}
      alt={`{${symbol}}`}
      title={`{${symbol}}`}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={cn(
        "inline-block shrink-0 rounded-full shadow-[0_1px_0_rgba(0,0,0,0.55)] select-none",
        className,
      )}
    />
  );
}

/** A mana cost like `{2}{R}{R}`, as the printed symbols. Split cards keep their `//`. */
export function ManaCost({ cost, size = 15 }: { cost: string; size?: number }) {
  if (!cost) return null;
  const faces = cost.split(" // ");
  return (
    <span className="inline-flex items-center gap-1" aria-label={`Mana cost ${cost}`}>
      {faces.map((face, f) => (
        <span key={f} className="inline-flex items-center gap-[2px]">
          {f > 0 && <span className="px-0.5 text-faint-foreground">/</span>}
          {parseManaCost(face).map((s, i) => (
            <ManaSymbol key={i} symbol={s} size={size} />
          ))}
        </span>
      ))}
    </span>
  );
}

/** Colour identity as mana symbols; colourless shows the {C} symbol. */
export function ColorIdentity({ colors, size = 15 }: { colors: string[]; size?: number }) {
  const list = colors.length ? colors : ["C"];
  return (
    <span className="inline-flex items-center gap-[2px]">
      {list.map((c, i) => (
        <ManaSymbol key={`${c}-${i}`} symbol={c} size={size} />
      ))}
    </span>
  );
}

// --- Sets and rarity -------------------------------------------------------

const RARITY_COLOR: Record<string, string> = {
  common: "var(--rarity-common)",
  uncommon: "var(--rarity-uncommon)",
  rare: "var(--rarity-rare)",
  mythic: "var(--rarity-mythic)",
  special: "var(--rarity-special)",
  bonus: "var(--rarity-special)",
};

export function rarityColor(rarity: string): string {
  return RARITY_COLOR[rarity] ?? "var(--faint-foreground)";
}

const GENERIC_SYMBOL = "https://svgs.scryfall.io/sets/planeswalker.svg";

/**
 * An expansion symbol tinted by rarity, as printed on the card. Without a set
 * code it draws a generic symbol (used by the rarity breakdown).
 */
export function SetSymbol({
  code,
  rarity = "",
  size = 16,
  className,
}: {
  code?: string;
  rarity?: string;
  size?: number;
  className?: string;
}) {
  const sets = useSets();
  const icon = code ? (sets?.[code.toUpperCase()]?.icon ?? setIconFallback(code)) : GENERIC_SYMBOL;
  return (
    <span
      aria-hidden
      className={cn("set-symbol", className)}
      style={
        {
          width: size,
          height: size,
          "--set-icon": `url("${icon}")`,
          color: rarityColor(rarity),
        } as CSSProperties
      }
    />
  );
}

/**
 * Set symbol + code + collector number, with the set's full name and the
 * rarity on hover. This is how a collector identifies a printing.
 */
export function Printing({
  setCode,
  collectorNumber,
  rarity,
  className,
  showSymbol = true,
}: {
  setCode: string;
  collectorNumber?: string;
  rarity: string;
  className?: string;
  showSymbol?: boolean;
}) {
  const sets = useSets();
  const set = sets?.[setCode.toUpperCase()];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            "inline-flex cursor-default items-center gap-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            className,
          )}
        >
          {showSymbol && <SetSymbol code={setCode} rarity={rarity} size={14} />}
          <span className="meta whitespace-nowrap">
            {setCode}
            {collectorNumber && <span className="text-faint-foreground/70"> · {collectorNumber}</span>}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <span className="font-medium">{set?.name ?? setCode.toUpperCase()}</span>
        <span className="text-muted-foreground">
          {" "}
          · {rarityLabel(rarity)}
          {collectorNumber && ` · #${collectorNumber}`}
          {set?.released && ` · ${set.released.slice(0, 4)}`}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

export function FoilMark({ className }: { className?: string }) {
  return (
    <span
      className={cn("foil-text text-[10px] font-semibold tracking-[0.08em] uppercase", className)}
      title="Foil"
    >
      Foil
    </span>
  );
}

// --- Art -------------------------------------------------------------------

/**
 * Card artwork. `art` is the cropped illustration (rows, lists); `card` is the
 * whole card face (previews). A missing image keeps its footprint as a quiet
 * placeholder so rows stay aligned.
 */
export function CardThumb({
  uri,
  name,
  variant = "art",
  className,
}: {
  uri?: string;
  name: string;
  variant?: "art" | "card";
  className?: string;
}) {
  const base =
    variant === "art"
      ? "h-8 w-11 rounded-[4px]"
      : "aspect-[488/680] w-full rounded-[4.75%/3.4%]";
  if (!uri) {
    return <span aria-hidden className={cn("block shrink-0 bg-muted", base, className)} />;
  }
  return (
    <img
      src={cardImage(uri, variant === "art" ? "art_crop" : "normal")}
      alt={variant === "card" ? name : ""}
      loading="lazy"
      decoding="async"
      className={cn(
        "block shrink-0 bg-muted object-cover ring-1 ring-black/40",
        base,
        className,
      )}
    />
  );
}

/** Wraps a trigger so hovering it shows the full card face beside it. */
export function CardPreview({
  uri,
  name,
  children,
}: {
  uri?: string;
  name: string;
  children: ReactNode;
}) {
  if (!uri) return <>{children}</>;
  return (
    <HoverCard>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side="right" align="start" className="w-60">
        <CardThumb
          uri={uri}
          name={name}
          variant="card"
          className="shadow-[0_24px_48px_-16px_rgba(0,0,0,0.9)]"
        />
      </HoverCardContent>
    </HoverCard>
  );
}
