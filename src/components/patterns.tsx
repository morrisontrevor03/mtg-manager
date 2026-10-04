/*
 * App-level patterns, composed from the shadcn primitives in `./ui/`.
 *
 * `ui/` holds generic building blocks (Button, Input, …) themed through the
 * tokens in globals.css. This file holds the layout shapes this app repeats:
 * sections, the one raised surface, stat rows, page headers, and the empty /
 * loading / error states every data page needs. MTG-specific pieces (mana and
 * set symbols, card art) live in `./mtg.tsx`.
 *
 * Hierarchy comes from type, spacing and hairlines first. A bordered or raised
 * box is reserved for something that behaves like a distinct object.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "cn";
import { AlertCircleIcon, ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { CountUp } from "@/components/CountUp";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A titled region sitting straight on its background. The heading is sentence
 * case: `meta` is a quiet count or note beside it, `actions` sit at the right.
 */
export function Section({
  title,
  meta,
  actions,
  children,
  className,
  id,
}: {
  title?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={cn("min-w-0", className)} aria-labelledby={title && id ? id : undefined}>
      {(title || actions) && (
        <div className="mb-3 flex items-baseline gap-3">
          {title && (
            <h2 id={id} className="text-[15px] font-medium tracking-[-0.005em] text-foreground">
              {title}
            </h2>
          )}
          {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * The raised surface. Use it for one group of related content per region,
 * with hairline dividers inside, rather than a box per item.
 */
export function Surface({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("paper rounded-xl shadow-raised", className)}>{children}</div>;
}

/** A row of headline figures separated by hairlines, not boxed. */
export function StatRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-2 gap-y-5 sm:flex sm:flex-wrap sm:gap-y-4", className)}>
      {children}
    </dl>
  );
}

export function StatItem({
  label,
  value,
  count,
  prefix = "",
  decimals = 0,
  sub,
  emphasis = false,
}: {
  label: string;
  value?: ReactNode;
  /** Animate a numeric value counting up on first paint. */
  count?: number;
  prefix?: string;
  decimals?: number;
  sub?: ReactNode;
  /** Money and other figures worth drawing the eye to get the amber. */
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0 sm:border-l sm:border-border sm:px-7 sm:first:border-l-0 sm:first:pl-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "numeral mt-1 text-[1.65rem] leading-none font-semibold tracking-[-0.02em]",
          emphasis && "text-primary",
        )}
      >
        {count !== undefined ? <CountUp value={count} prefix={prefix} decimals={decimals} /> : value}
      </dd>
      {sub && <dd className="mt-1.5 text-xs text-faint-foreground">{sub}</dd>}
    </div>
  );
}

/** Page heading: serif title, an optional quiet line beneath, actions at right. */
export function PageHeader({
  title,
  lead,
  actions,
  children,
}: {
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
  /** Extra content under the title row, e.g. a back link above or totals. */
  children?: ReactNode;
}) {
  return (
    <div className="ink-in flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <h1 className="display text-[2rem] leading-tight font-semibold">{title}</h1>
        {lead && <div className="mt-1 max-w-prose text-sm text-muted-foreground">{lead}</div>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A link with a trailing arrow — the app's "go do this next" affordance. */
export function ActionLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline",
        className,
      )}
    >
      {children}
      <ArrowRightIcon
        aria-hidden
        className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
      />
    </Link>
  );
}

/**
 * Nothing to show yet. Drawn as an empty slot (dashed rule), says what goes
 * here, and offers the next step.
 */
export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  /** A lucide icon element; it is sized and dimmed here. */
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "ink-in flex flex-col items-start gap-1.5 rounded-xl border border-dashed border-border-strong/80 px-6 py-8 sm:px-8",
        className,
      )}
    >
      {icon && (
        <span aria-hidden className="mb-1.5 text-faint-foreground [&_svg]:size-6">
          {icon}
        </span>
      )}
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-md text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-2.5">{action}</div>}
    </div>
  );
}

/**
 * Placeholder shown while a client page waits on `/api/*`. Sized in lines rather
 * than pixels so it occupies roughly the height of the content it replaces,
 * which keeps the page from jumping when data lands.
 */
export function SkeletonLines({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-4 rounded-full" style={{ width: `${92 - i * 11}%` }} />
      ))}
    </div>
  );
}

/** Failed request. Reads as a problem to act on, not as empty content. */
export function LoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertCircleIcon />
      <AlertTitle>Couldn&rsquo;t load this</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        {onRetry && (
          <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
            Try again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

/** "All decks"-style link back up a level, with a leading arrow. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeftIcon className="size-3.5" />
      {children}
    </Link>
  );
}
