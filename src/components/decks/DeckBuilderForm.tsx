"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui";
import type { Color, Format } from "@/lib/types";

interface Candidate {
  name: string;
  colorIdentity: Color[];
}

export function DeckBuilderForm({ commanderCandidates }: { commanderCandidates: Candidate[] }) {
  const router = useRouter();
  const [format, setFormat] = useState<Format>("commander");
  const [prompt, setPrompt] = useState("");
  const [commanderName, setCommanderName] = useState("");
  const [allowAcquire, setAllowAcquire] = useState(true);
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (prompt.trim().length < 3) return;
    setBusy(true);
    setError(null);
    setWarnings([]);
    try {
      const res = await fetch("/api/decks/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          prompt: prompt.trim(),
          commanderName: format === "commander" && commanderName ? commanderName : undefined,
          allowAcquire,
          budgetUsd: allowAcquire && budget ? Number(budget) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Deck build failed.");
        return;
      }
      const issues: string[] = [
        ...(data.violations ?? []),
        ...(data.unresolved ?? []).map((n: string) => `Unresolved card: ${n}`),
        ...(data.shortfalls ?? []),
      ];
      if (issues.length && data.deckId) {
        setWarnings(issues);
        // Still navigate after a short beat so the user sees the deck was saved.
        setTimeout(() => router.push(`/decks/view?id=${data.deckId}`), 1200);
      } else {
        router.push(`/decks/view?id=${data.deckId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deck build failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Panel title="Format">
        <div className="flex gap-2">
          {(["commander", "standard"] as Format[]).map((f) => (
            <button
              type="button"
              key={f}
              onClick={() => setFormat(f)}
              className={`btn ${format === f ? "" : "btn-ghost"}`}
            >
              {f === "commander" ? "Commander" : "Standard"}
            </button>
          ))}
        </div>
      </Panel>

      {format === "commander" && (
        <Panel title="Commander (optional)">
          {commanderCandidates.length === 0 ? (
            <p className="text-sm text-muted">
              No legendary creatures in your collection yet — the model will pick one, or you can
              name any commander in the prompt.
            </p>
          ) : (
            <select
              className="input"
              value={commanderName}
              onChange={(e) => setCommanderName(e.target.value)}
            >
              <option value="">Let the model choose from my collection</option>
              {commanderCandidates.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.colorIdentity.join("") || "C"})
                </option>
              ))}
            </select>
          )}
        </Panel>
      )}

      <Panel title="What should the deck do?">
        <textarea
          className="input h-28"
          placeholder={
            format === "commander"
              ? "e.g. Goblin tribal aggro with lots of token swarm and sacrifice payoffs"
              : "e.g. Aggressive mono-red burn that closes by turn 5"
          }
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </Panel>

      <Panel title="Card pool">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allowAcquire}
            onChange={(e) => setAllowAcquire(e.target.checked)}
          />
          Allow the model to suggest cards I don&apos;t own (flagged as acquisitions)
        </label>
        {allowAcquire && (
          <label className="mt-2 block text-sm text-muted">
            Rough budget for acquisitions (USD, optional)
            <input
              className="input mt-1 w-40"
              type="number"
              min={0}
              placeholder="e.g. 50"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </label>
        )}
      </Panel>

      <div className="flex items-center gap-3">
        <button className="btn" disabled={busy || prompt.trim().length < 3}>
          {busy ? "Building… (this can take a minute)" : "Build deck"}
        </button>
        {busy && <span className="text-sm text-muted">Calling the model and validating the list…</span>}
      </div>

      {error && <p className="text-sm text-[color:var(--danger)]">{error}</p>}
      {warnings.length > 0 && (
        <div className="rounded-lg border border-accent/30 bg-accent/10 p-3 text-sm">
          <p className="font-medium text-accent">Deck saved with rule warnings:</p>
          <ul className="mt-1 list-disc pl-5 text-accent/90">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          <p className="mt-1 text-muted">Opening the deck…</p>
        </div>
      )}
    </form>
  );
}
