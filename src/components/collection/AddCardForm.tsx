"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/authClient";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
        const res = await apiFetch(`/api/cards/search?q=${encodeURIComponent(name)}`);
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
      const res = await apiFetch("/api/collection", {
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
        <Input
          aria-label="Card name"
          placeholder="Card name, e.g. Lightning Bolt"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          autoFocus
        />
        {suggestions.length > 0 && (
          <ul className="fade-in absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border-strong bg-popover p-1 text-sm text-popover-foreground shadow-raised-lg">
            {suggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  className="block w-full rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
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
        <Label className="font-normal text-muted-foreground">
          Qty
          <Input
            type="number"
            min={1}
            max={999}
            className="w-20"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
          />
        </Label>
        <Label className="font-normal text-muted-foreground">
          <Checkbox checked={foil} onCheckedChange={(v) => setFoil(v === true)} />
          Foil
        </Label>
        <Button type="submit" className="ml-auto" disabled={busy}>
          {busy ? "Adding…" : "Add"}
        </Button>
      </div>

      {msg && (
        <p className={`text-sm ${msg.kind === "ok" ? "text-success" : "text-destructive"}`}>{msg.text}</p>
      )}
    </form>
  );
}
