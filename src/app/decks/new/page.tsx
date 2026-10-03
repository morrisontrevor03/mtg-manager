"use client";

import Link from "next/link";
import { DeckBuilderForm } from "@/components/decks/DeckBuilderForm";
import { LoadError, PageHeader, Panel, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import type { Color } from "@/lib/types";

interface CommandersResponse {
  deckBuilderEnabled: boolean;
  candidates: { cardId: string; name: string; colorIdentity: Color[] }[];
}

export default function NewDeckPage() {
  const { data, error, loading, reload } = useApi<CommandersResponse>(
    "/api/collection/commanders",
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Build a deck"
        lead="Say what you want the deck to do. It gets built from your collection and checked against format rules."
        actions={
          <Link href="/decks" className="text-sm text-muted hover:text-foreground">
            ← All decks
          </Link>
        }
      />

      {error ? (
        <LoadError message={error} onRetry={reload} />
      ) : loading || !data ? (
        <Panel>
          <Skeleton lines={5} />
        </Panel>
      ) : (
        <>
          {/*
            The server used to read ANTHROPIC_API_KEY to decide this. A static
            page cannot, so the API reports it — which also means this now
            reflects whether the deployment has the builder switched on, not just
            whether a key exists.
          */}
          {!data.deckBuilderEnabled && (
            <Panel>
              <p className="text-accent">
                The deck builder is switched off in this deployment. Locally, set{" "}
                <code className="font-mono">ANTHROPIC_API_KEY</code> in{" "}
                <code className="font-mono">.env</code> and restart the dev server. On AWS, set{" "}
                <code className="font-mono">enable_deck_builder = true</code> in your Terraform
                variables — see <code className="font-mono">infra/README.md</code> for why it ships
                disabled.
              </p>
            </Panel>
          )}

          <DeckBuilderForm
            commanderCandidates={data.candidates.map((c) => ({
              name: c.name,
              colorIdentity: c.colorIdentity,
            }))}
          />
        </>
      )}
    </div>
  );
}
