import type { ReactNode } from "react";
import type { Color } from "@/lib/types";
import { CountUp } from "@/components/CountUp";

export function Panel({
  title,
  children,
  actions,
  className = "",
  lift = false,
}: {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  lift?: boolean;
}) {
  return (
    <section className={`card p-5 ${lift ? "card-lift" : ""} ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="eyebrow">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
  /** Animate a numeric value counting up on first paint. */
  count,
  prefix = "",
  decimals = 0,
}: {
  label: string;
  value?: string | number;
  sub?: string;
  count?: number;
  prefix?: string;
  decimals?: number;
}) {
  return (
    <div className="card card-lift p-5">
      <div className="eyebrow">{label}</div>
      <div className="display mt-1.5 text-3xl font-semibold">
        {count !== undefined ? (
          <CountUp value={count} prefix={prefix} decimals={decimals} />
        ) : (
          value
        )}
      </div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

/*
 * Mana pips. Colours are the real MTG identities, warmed slightly so they sit
 * on parchment rather than glowing off it. Each pip is a small pressed disc.
 */
const PIP: Record<string, string> = {
  W: "bg-[#f4ecd4] text-[#3a3222] ring-[#cbbf9f]",
  U: "bg-[#4a91d6] text-[#08243d] ring-[#2f6ba5]",
  B: "bg-[#4a4239] text-[#e8dcc9] ring-[#2e2822]",
  R: "bg-[#d4573d] text-[#2e0d06] ring-[#a63f2a]",
  G: "bg-[#6fa25c] text-[#0f2408] ring-[#4d7a3e]",
  C: "bg-[#9d907c] text-[#241d14] ring-[#7b6f5d]",
};

const PIP_BASE =
  "inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold " +
  "ring-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition-transform duration-200";

export function ColorPips({ colors }: { colors: Color[] | string[] }) {
  const list = colors.length ? colors : ["C"];
  return (
    <span className="group inline-flex gap-0.5">
      {list.map((c, i) => (
        <span
          key={`${c}-${i}`}
          className={`${PIP_BASE} ${PIP[c] ?? PIP.C} group-hover:-translate-y-0.5`}
          style={{ transitionDelay: `${i * 35}ms` }}
        >
          {c}
        </span>
      ))}
    </span>
  );
}

/** Render a mana-cost string like "{2}{R}{R}" as pressed pips. */
export function ManaCost({ cost }: { cost: string }) {
  const symbols = [...cost.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  if (symbols.length === 0) return null;
  return (
    <span className="inline-flex gap-0.5 font-mono">
      {symbols.map((s, i) => (
        <span
          key={i}
          className={`${PIP_BASE} min-w-4 px-1 ${PIP[s] ?? "bg-surface-3 text-muted ring-border-strong"}`}
        >
          {s}
        </span>
      ))}
    </span>
  );
}

export function Badge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "good" | "warn" | "info";
}) {
  const tones = {
    default: "bg-surface-2 text-muted border-border",
    good: "bg-[#8aa363]/15 text-[#a9c184] border-[#8aa363]/35",
    warn: "bg-[#d6a04a]/15 text-[#e0b46b] border-[#d6a04a]/35",
    info: "bg-[#4a91d6]/15 text-[#7fb4e4] border-[#4a91d6]/35",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Page heading with an optional lead paragraph and trailing actions. */
export function PageHeader({
  title,
  lead,
  actions,
}: {
  title: string;
  lead?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="ink-in flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="display text-3xl font-semibold">{title}</h1>
        {lead && <p className="mt-1.5 max-w-prose text-sm text-muted">{lead}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Centred empty state, used when a page has nothing to show yet. */
export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="card ink-in flex flex-col items-center gap-2 px-6 py-14 text-center">
      {icon && (
        <span aria-hidden className="text-3xl opacity-70">
          {icon}
        </span>
      )}
      <p className="display text-lg font-semibold">{title}</p>
      <div className="max-w-sm text-sm text-muted">{children}</div>
    </div>
  );
}

/**
 * Placeholder shown while a client page waits on `/api/*`. Sized in lines rather
 * than pixels so it occupies roughly the height of the content it replaces,
 * which keeps the page from jumping when data lands.
 */
export function Skeleton({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="shimmer h-4 rounded-full"
          style={{ width: `${92 - i * 11}%` }}
        />
      ))}
    </div>
  );
}

/** Failed request. Reads as a problem to act on, not as empty content. */
export function LoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-3.5">
      <p className="text-sm font-medium text-foreground">Couldn&rsquo;t load this</p>
      <p className="mt-1 text-sm text-muted">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn btn-ghost mt-3 text-sm">
          Try again
        </button>
      )}
    </div>
  );
}
