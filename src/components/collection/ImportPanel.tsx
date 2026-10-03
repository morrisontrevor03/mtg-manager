"use client";

import { useState } from "react";

interface ImportResult {
  requested: number;
  matchedCount: number;
  addedCopies: number;
  unmatched: string[];
}

export function ImportPanel({ onChanged }: { onChanged?: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const payload = text.trim();
    if (!payload) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/collection/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: payload }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Import failed.");
      else {
        setResult(data);
        setText("");
        onChanged?.();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setText(await file.text());
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        One card name per line. <code className="font-mono">2x</code> / <code className="font-mono">2 </code>{" "}
        quantity prefixes and trailing set codes are handled.
      </p>
      <textarea
        className="input h-36 font-mono text-sm"
        placeholder={"4 Lightning Bolt\nRagavan, Nimble Pilferer\nSol Ring"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex items-center gap-3">
        <input type="file" accept=".csv,.txt" onChange={onFile} className="text-sm text-muted" />
        <button className="btn ml-auto" onClick={run} disabled={busy || !text.trim()}>
          {busy ? "Importing…" : "Import"}
        </button>
      </div>

      {error && <p className="text-sm text-[color:var(--danger)]">{error}</p>}
      {result && (
        <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm">
          <p className="text-[color:var(--success)]">
            Added {result.addedCopies} copies across {result.matchedCount} of {result.requested} names.
          </p>
          {result.unmatched.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-accent">
                {result.unmatched.length} not found
              </summary>
              <ul className="mt-1 list-disc pl-5 text-muted">
                {result.unmatched.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
