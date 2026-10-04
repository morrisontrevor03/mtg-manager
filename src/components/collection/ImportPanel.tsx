"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/authClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
      const res = await apiFetch("/api/collection/import", {
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
      <Textarea
        aria-label="Card list"
        className="h-44 font-mono md:text-sm"
        placeholder={"4 Lightning Bolt\nRagavan, Nimble Pilferer\nSol Ring"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex items-center gap-3">
        <Input
          type="file"
          accept=".csv,.txt"
          aria-label="Import from file"
          onChange={onFile}
          className="w-auto max-w-64 cursor-pointer text-muted-foreground file:cursor-pointer file:text-primary"
        />
        <Button className="ml-auto" onClick={run} disabled={busy || !text.trim()}>
          {busy ? "Importing…" : "Import"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {result && (
        <div className="border-t border-border pt-3 text-sm">
          <p className="text-success">
            Added {result.addedCopies} copies across {result.matchedCount} of {result.requested} names.
          </p>
          {result.unmatched.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-primary">
                {result.unmatched.length} not found
              </summary>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
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
