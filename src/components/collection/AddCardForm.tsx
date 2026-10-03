"use client";

import { useEffect, useRef, useState } from "react";

/**
 * `onChanged` replaces what used to be `router.refresh()`. The frontend is a
 * static export with no server to re-render, so the owning page re-fetches
 * `/api/*` instead.
 */
export function AddCardForm({ onChanged }: { onChanged?: () => void }) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [foil, setFoil] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    // Both the clear and the fetch happen inside the timeout, so nothing sets
    // state synchronously from the effect body.
    debounce.current = setTimeout(async () => {
      if (name.trim().length < 2) {
        setSuggestions([]);
        return;
      }
      try {
        const res = await fetch(`/api/cards/search?q=${encodeURIComponent(name)}`);
        const data = await res.json();
        setSuggestions((data.names ?? []).slice(0, 8));
      } catch {
        setSuggestions([]);
      }
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [name]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), quantity, foil }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ kind: "err", text: data.error ?? "Failed to add card." });
      } else {
        setMsg({ kind: "ok", text: `Added ${quantity}× ${data.name}.` });
        setName("");
        setSuggestions([]);
        setQuantity(1);
        setFoil(false);
        onChanged?.();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="relative">
        <input
          className="input"
          placeholder="Card name (e.g. Lightning Bolt)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
        />
        {suggestions.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface-2 text-sm">
            {suggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left hover:bg-accent/20"
                  onClick={() => {
                    setName(s);
                    setSuggestions([]);
                  }}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm text-muted">
          Qty
          <input
            type="number"
            min={1}
            max={999}
            className="input ml-2 w-20"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={foil} onChange={(e) => setFoil(e.target.checked)} />
          Foil
        </label>
        <button className="btn ml-auto" disabled={busy}>
          {busy ? "Adding…" : "Add"}
        </button>
      </div>

      {msg && (
        <p className={`text-sm ${msg.kind === "ok" ? "text-[color:var(--success)]" : "text-[color:var(--danger)]"}`}>{msg.text}</p>
      )}
    </form>
  );
}
