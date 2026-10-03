"use client";

import { useState, useTransition } from "react";
import { Badge, ColorPips, ManaCost } from "@/components/ui";
import { apiFetch } from "@/lib/authClient";

export interface Row {
  id: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  typeLine: string;
  manaCost: string;
  rarity: string;
  colors: string[];
  quantity: number;
  foil: boolean;
  priceUsd: number;
  scryfallUri: string;
}

const STEP_BTN =
  "flex h-6 w-6 items-center justify-center rounded-md border border-border bg-surface-2 " +
  "text-muted transition-all duration-150 hover:border-border-strong hover:bg-surface-3 " +
  "hover:text-foreground active:scale-90 disabled:opacity-40";

export function CollectionTable({
  rows,
  onChanged,
  refreshing = false,
}: {
  rows: Row[];
  onChanged?: () => void;
  /** The owning page is re-fetching, so the rows on screen are briefly stale. */
  refreshing?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = filter
    ? rows.filter(
        (r) =>
          r.name.toLowerCase().includes(filter.toLowerCase()) ||
          r.typeLine.toLowerCase().includes(filter.toLowerCase()),
      )
    : rows;

  async function patch(id: string, quantity: number) {
    setBusyId(id);
    await apiFetch(`/api/collection/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    });
    setBusyId(null);
    startTransition(() => onChanged?.());
  }

  return (
    <div className="space-y-3">
      <input
        className="input"
        placeholder="Filter by name or type…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="pb-2 pr-2 font-normal"><span className="eyebrow">Qty</span></th>
              <th className="pb-2 font-normal"><span className="eyebrow">Card</span></th>
              <th className="pb-2 font-normal"><span className="eyebrow">Cost</span></th>
              <th className="hidden pb-2 font-normal md:table-cell">
                <span className="eyebrow">Type</span>
              </th>
              <th className="pb-2 font-normal"><span className="eyebrow">Set</span></th>
              <th className="pb-2 text-right font-normal"><span className="eyebrow">USD</span></th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr
                key={r.id}
                className="group border-b border-border/60 transition-colors duration-200 last:border-0 hover:bg-surface-2/60"
              >
                <td className="py-2 pr-2">
                  <div className="flex items-center gap-1">
                    <button
                      className={STEP_BTN}
                      disabled={busyId === r.id}
                      onClick={() => patch(r.id, r.quantity - 1)}
                      aria-label={`Remove one ${r.name}`}
                    >
                      −
                    </button>
                    <span className="numeral w-6 text-center">{r.quantity}</span>
                    <button
                      className={STEP_BTN}
                      disabled={busyId === r.id}
                      onClick={() => patch(r.id, r.quantity + 1)}
                      aria-label={`Add one ${r.name}`}
                    >
                      +
                    </button>
                  </div>
                </td>

                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <a
                      href={r.scryfallUri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium decoration-accent/60 underline-offset-2 hover:underline"
                    >
                      {r.name}
                    </a>
                    {r.foil && (
                      <span className="text-[10px] tracking-wide text-accent">✦ FOIL</span>
                    )}
                    <ColorPips colors={r.colors} />
                  </div>
                </td>

                <td className="py-2">
                  <ManaCost cost={r.manaCost} />
                </td>

                <td className="hidden py-2 text-muted md:table-cell">{r.typeLine}</td>

                <td className="py-2">
                  <span className="font-mono text-[11px] text-muted-dim">
                    {r.setCode} {r.collectorNumber}
                  </span>
                </td>

                <td className="numeral py-2 text-right">
                  {r.priceUsd ? `$${r.priceUsd.toFixed(2)}` : <span className="text-muted-dim">—</span>}
                </td>

                <td className="py-2 text-right">
                  {/* Revealed on hover so the table stays calm at rest. */}
                  <button
                    className="text-xs text-muted-dim opacity-0 transition-opacity duration-200 hover:text-[color:var(--danger)] focus:opacity-100 group-hover:opacity-100"
                    disabled={busyId === r.id}
                    onClick={() => patch(r.id, 0)}
                  >
                    remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {visible.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">
          Nothing matches <span className="text-foreground">“{filter}”</span>.
        </p>
      )}

      {(pending || refreshing) && (
        <p className="text-xs text-muted-dim">
          <Badge>updating…</Badge>
        </p>
      )}
    </div>
  );
}
