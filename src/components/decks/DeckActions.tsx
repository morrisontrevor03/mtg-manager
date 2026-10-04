"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, CopyIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { apiFetch } from "@/lib/authClient";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function DeckActions({
  deckId,
  status,
  name,
  deckText,
  onChanged,
}: {
  deckId: string;
  status: string;
  name: string;
  deckText: string;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    await apiFetch(`/api/decks/${deckId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    setEditing(false);
    onChanged?.();
  }

  async function remove() {
    setBusy(true);
    await apiFetch(`/api/decks/${deckId}`, { method: "DELETE" });
    router.push("/decks");
  }

  async function copy() {
    await navigator.clipboard.writeText(deckText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {editing ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void patch({ name: draftName });
          }}
        >
          <Input
            className="w-64"
            aria-label="Deck name"
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
          />
          <Button type="submit" disabled={busy || !draftName.trim()}>
            Save
          </Button>
          <Button type="button" variant="outline" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <Button variant="outline" onClick={() => setEditing(true)}>
          <PencilIcon />
          Rename
        </Button>
      )}

      <Button
        variant="outline"
        disabled={busy}
        onClick={() => patch({ status: status === "final" ? "draft" : "final" })}
      >
        {status === "final" ? "Mark as draft" : "Mark as final"}
      </Button>

      <Button variant="outline" onClick={copy}>
        {copied ? <CheckIcon /> : <CopyIcon />}
        {copied ? "Copied" : "Copy as text"}
      </Button>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" disabled={busy}>
            <Trash2Icon />
            Delete
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The deck list is removed for good. Cards in your collection are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Delete deck
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
