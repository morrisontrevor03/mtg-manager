"use client";

import { DeckBuilderForm } from "@/components/decks/DeckBuilderForm";
import { BackLink, LoadError, PageHeader, SkeletonLines, Surface } from "@/components/patterns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
        lead="Describe how the deck should play. It is built from cards you own and checked against format rules."
        actions={
          <BackLink href="/decks">All decks</BackLink>
        }
      />

      {error ? (
        <LoadError message={error} onRetry={reload} />
      ) : loading || !data ? (
        <Surface className="max-w-2xl p-5">
          <SkeletonLines lines={5} />
        </Surface>
      ) : (
        <>
          {/*
            The server used to read ANTHROPIC_API_KEY to decide this. A static
            page cannot, so the API reports it — which also means this now
            reflects whether the deployment has the builder switched on, not just
            whether a key exists.
          */}
          {!data.deckBuilderEnabled && (
            <Alert variant="warning">
              <AlertTitle>The deck builder is switched off in this deployment</AlertTitle>
              <AlertDescription>
                <p>
                  Locally, set{" "}
                  <code className="font-mono">ANTHROPIC_API_KEY</code> in{" "}
                  <code className="font-mono">.env</code> and restart the dev server. On AWS, set{" "}
                  <code className="font-mono">enable_deck_builder = true</code> in your Terraform
                  variables — see <code className="font-mono">infra/README.md</code> for why it ships
                  disabled.
                </p>
              </AlertDescription>
            </Alert>
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
