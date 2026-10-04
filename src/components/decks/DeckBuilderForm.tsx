"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Section, Surface } from "@/components/patterns";
import type { Color, Format } from "@/lib/types";
import { apiFetch } from "@/lib/authClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** Radix Select items cannot carry an empty value, so "no preference" needs a name. */
const AUTO_COMMANDER = "__auto";

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
      const res = await apiFetch("/api/decks/build", {
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
    <form onSubmit={submit} className="max-w-2xl space-y-5">
      <Surface className="divide-y divide-border [&>section]:p-5">
        <Section title="Format">
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={2}
            value={format}
            // A single-select group emits "" when the active item is clicked again; keep it set.
            onValueChange={(v) => v && setFormat(v as Format)}
            aria-label="Format"
          >
            <ToggleGroupItem value="commander">Commander</ToggleGroupItem>
            <ToggleGroupItem value="standard">Standard</ToggleGroupItem>
          </ToggleGroup>
        </Section>

        {format === "commander" && (
          <Section title="Commander" meta="optional">
            {commanderCandidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No legendary creatures in your collection yet — the model will pick one, or you can
                name any commander in the prompt.
              </p>
            ) : (
              <Select
                value={commanderName || AUTO_COMMANDER}
                onValueChange={(v) => setCommanderName(v === AUTO_COMMANDER ? "" : v)}
              >
                <SelectTrigger className="w-full" aria-label="Commander">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO_COMMANDER}>Let the model choose from my collection</SelectItem>
                  {commanderCandidates.map((c) => (
                    <SelectItem key={c.name} value={c.name}>
                      {c.name}
                      <span className="text-muted-foreground">
                        ({c.colorIdentity.join("") || "C"})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Section>
        )}

        <Section title="What should the deck do?">
          <Textarea
            className="min-h-28"
            aria-label="What should the deck do?"
            placeholder={
              format === "commander"
                ? "e.g. Goblin tribal aggro with lots of token swarm and sacrifice payoffs"
                : "e.g. Aggressive mono-red burn that closes by turn 5"
            }
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </Section>

        <Section title="Card pool">
          <Label className="font-normal">
            <Checkbox
              checked={allowAcquire}
              onCheckedChange={(v) => setAllowAcquire(v === true)}
            />
            Allow the model to suggest cards I don&apos;t own (flagged as acquisitions)
          </Label>
          {allowAcquire && (
            <label className="mt-3 block text-sm text-muted-foreground">
              Rough budget for acquisitions (USD, optional)
              <Input
                className="mt-1.5 w-40"
                type="number"
                min={0}
                placeholder="e.g. 50"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </label>
          )}
        </Section>
      </Surface>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy || prompt.trim().length < 3}>
          {busy ? "Building… (this can take a minute)" : "Build deck"}
        </Button>
        {busy && <span className="text-sm text-muted-foreground">Calling the model and validating the list…</span>}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {warnings.length > 0 && (
        <Alert variant="warning">
          <AlertTitle>Deck saved with rule warnings</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            <p className="text-muted-foreground">Opening the deck…</p>
          </AlertDescription>
        </Alert>
      )}
    </form>
  );
}
