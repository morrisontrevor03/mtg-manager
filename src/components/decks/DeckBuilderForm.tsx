"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Section, Surface } from "@/components/patterns";
import { ManaSymbol } from "@/components/mtg";
import { COLOR_NAMES, WUBRG, type Color, type Format } from "@/lib/types";
import { ARCHETYPES, BuildParamsSchema, type Archetype, type BuildParamsInput } from "@/lib/deckParams";
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
const ANY_ARCHETYPE = "__any";

/** How often to ask whether the build has finished. */
const POLL_MS = 2500;
/** Consecutive failed status checks before giving up on a build. */
const MAX_POLL_ERRORS = 5;

interface Candidate {
  name: string;
  colorIdentity: Color[];
}

type JobStatus = "queued" | "running" | "succeeded" | "failed";

interface JobView {
  id: string;
  status: JobStatus;
  deckId: string | null;
  warnings: string[];
  error: string;
}

export function DeckBuilderForm({ commanderCandidates }: { commanderCandidates: Candidate[] }) {
  const router = useRouter();
  const [format, setFormat] = useState<Format>("commander");
  const [prompt, setPrompt] = useState("");
  const [commanderName, setCommanderName] = useState("");
  const [colors, setColors] = useState<Color[]>([]);
  const [archetype, setArchetype] = useState<Archetype | "">("");
  const [allowAcquire, setAllowAcquire] = useState(true);
  const [budget, setBudget] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>("queued");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const commanderFixesColors = format === "commander" && commanderName !== "";

  const body: BuildParamsInput = {
    format,
    prompt: prompt.trim(),
    commanderName: format === "commander" && commanderName ? commanderName : undefined,
    colors,
    archetype: archetype || undefined,
    allowAcquire,
    budgetUsd: allowAcquire && budget ? Number(budget) : undefined,
  };
  // The server parses the same schema, so this is exactly its notion of valid.
  const valid = BuildParamsSchema.safeParse(body).success;
  const busy = submitting || jobId !== null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setSubmitting(true);
    setError(null);
    setWarnings([]);
    try {
      const res = await apiFetch("/api/decks/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.jobId) {
        // A build is already running (e.g. started before a reload): follow it.
        startPolling(data.jobId);
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Deck build failed.");
        return;
      }
      startPolling(data.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deck build failed.");
    } finally {
      setSubmitting(false);
    }
  }

  function startPolling(id: string) {
    setJobStatus("queued");
    setElapsed(0);
    setJobId(id);
  }

  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let errors = 0;
    const started = Date.now();
    const ticker = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);

    const stop = (message: string | null) => {
      clearInterval(ticker);
      if (message) setError(message);
      setJobId(null);
    };

    async function poll() {
      try {
        const res = await apiFetch(`/api/decks/build/${jobId}`, { cache: "no-store" });
        const job = (await res.json().catch(() => null)) as (JobView & { error?: string }) | null;
        if (cancelled) return;
        if (!res.ok || !job) throw new Error(job?.error ?? `Status check failed (${res.status})`);
        errors = 0;
        setJobStatus(job.status);

        if (job.status === "failed") return stop(job.error || "Deck build failed.");
        if (job.status === "succeeded" && job.deckId) {
          clearInterval(ticker);
          const href = `/decks/view?id=${job.deckId}`;
          if (job.warnings.length) {
            setWarnings(job.warnings);
            // Give the user a beat to see the deck was saved with warnings.
            timer = setTimeout(() => router.push(href), 1500);
          } else {
            router.push(href);
          }
          return;
        }
      } catch (err) {
        if (cancelled) return;
        if (++errors >= MAX_POLL_ERRORS) {
          return stop(err instanceof Error ? err.message : "Lost track of the build.");
        }
      }
      timer = setTimeout(poll, POLL_MS);
    }

    timer = setTimeout(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(ticker);
    };
  }, [jobId, router]);

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
            disabled={busy}
          >
            <ToggleGroupItem value="commander">Commander</ToggleGroupItem>
            <ToggleGroupItem value="standard">Standard</ToggleGroupItem>
          </ToggleGroup>
        </Section>

        {format === "commander" && (
          <Section title="Commander" meta="optional">
            {commanderCandidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No legendary creatures in your collection yet. The model will pick one, or you can
                name any commander in the notes below.
              </p>
            ) : (
              <Select
                value={commanderName || AUTO_COMMANDER}
                onValueChange={(v) => setCommanderName(v === AUTO_COMMANDER ? "" : v)}
                disabled={busy}
              >
                <SelectTrigger className="w-full" aria-label="Commander">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO_COMMANDER}>Let the model choose</SelectItem>
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

        <Section
          title="Colours"
          meta={commanderFixesColors ? "set by the commander" : "optional"}
        >
          <ToggleGroup
            type="multiple"
            variant="outline"
            spacing={2}
            value={commanderFixesColors ? [] : colors}
            onValueChange={(v) => setColors(WUBRG.filter((c) => v.includes(c)))}
            aria-label="Colours"
            disabled={busy || commanderFixesColors}
          >
            {WUBRG.map((c) => (
              <ToggleGroupItem
                key={c}
                value={c}
                aria-label={COLOR_NAMES[c]}
                title={COLOR_NAMES[c]}
                className="px-2.5 data-[state=off]:[&_img]:opacity-45 data-[state=off]:[&_img]:grayscale"
              >
                <ManaSymbol symbol={c} size={20} />
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="mt-2 text-xs text-muted-foreground">
            {commanderFixesColors
              ? "The deck uses your commander's colour identity."
              : colors.length
                ? `Every card stays within ${colors.map((c) => COLOR_NAMES[c]).join(", ")}.`
                : "None picked: the model chooses."}
          </p>
        </Section>

        <Section title="Archetype" meta="optional">
          <Select
            value={archetype || ANY_ARCHETYPE}
            onValueChange={(v) => setArchetype(v === ANY_ARCHETYPE ? "" : (v as Archetype))}
            disabled={busy}
          >
            <SelectTrigger className="w-full" aria-label="Archetype">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_ARCHETYPE}>Any archetype</SelectItem>
              {ARCHETYPES.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {archetype && (
            <p className="mt-2 text-xs text-muted-foreground">
              {ARCHETYPES.find((a) => a.value === archetype)?.brief}
            </p>
          )}
        </Section>

        <Section
          title="What should the deck do?"
          meta={valid || prompt.trim().length >= 3 ? "optional" : "or pick colours or an archetype"}
        >
          <Textarea
            className="min-h-28"
            aria-label="What should the deck do?"
            placeholder={
              format === "commander"
                ? "e.g. Goblin tribal with lots of token swarm and sacrifice payoffs"
                : "e.g. Burn that closes by turn 5"
            }
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={busy}
          />
        </Section>

        <Section title="Card pool">
          <Label className="font-normal">
            <Checkbox
              checked={allowAcquire}
              onCheckedChange={(v) => setAllowAcquire(v === true)}
              disabled={busy}
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
                disabled={busy}
              />
            </label>
          )}
        </Section>
      </Surface>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || !valid}>
          {busy ? "Building…" : "Build deck"}
        </Button>
        {jobId && (
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {jobStatus === "queued"
              ? "Starting the builder…"
              : "Drafting with the model and checking format rules…"}{" "}
            <span className="numeral">{formatElapsed(elapsed)}</span>
            <span className="block text-xs">Usually one to three minutes. You can leave this page; the deck is saved when it finishes.</span>
          </span>
        )}
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

function formatElapsed(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
