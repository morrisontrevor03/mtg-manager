"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    await fetch(`/api/decks/${deckId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    setEditing(false);
    onChanged?.();
  }

  async function remove() {
    if (!confirm("Delete this deck?")) return;
    setBusy(true);
    await fetch(`/api/decks/${deckId}`, { method: "DELETE" });
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
        <>
          <input
            className="input w-64"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
          />
          <button className="btn text-sm" disabled={busy} onClick={() => patch({ name: draftName })}>
            Save
          </button>
          <button className="btn btn-ghost text-sm" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </>
      ) : (
        <button className="btn btn-ghost text-sm" onClick={() => setEditing(true)}>
          Rename
        </button>
      )}

      <button
        className="btn btn-ghost text-sm"
        disabled={busy}
        onClick={() => patch({ status: status === "final" ? "draft" : "final" })}
      >
        {status === "final" ? "Mark as draft" : "Mark as final"}
      </button>

      <button className="btn btn-ghost text-sm" onClick={copy}>
        {copied ? "Copied!" : "Copy as text"}
      </button>

      <button className="btn btn-ghost text-sm !text-[color:var(--danger)]" disabled={busy} onClick={remove}>
        Delete
      </button>
    </div>
  );
}
