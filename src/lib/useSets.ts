"use client";

import { useEffect, useState } from "react";

/**
 * Scryfall's set catalogue, trimmed to what the UI shows: the set's full name
 * (tooltips) and the right icon (promo and token sets borrow their parent's).
 *
 * The Card table stores only the set code, and the catalogue changes a few
 * times a month, so the browser fetches it straight from Scryfall and keeps a
 * trimmed copy (~60 KB rather than ~1 MB) for a week. Storage can be missing
 * or full; every access is guarded and the UI degrades to bare set codes.
 */

export interface SetInfo {
  name: string;
  icon: string;
  released?: string;
}

export type SetMap = Record<string, SetInfo>;

const STORAGE_KEY = "mtg:sets:v1";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

let memory: SetMap | null = null;
let inflight: Promise<SetMap | null> | null = null;

interface ScryfallSet {
  code: string;
  name: string;
  icon_svg_uri: string;
  released_at?: string;
}

function readStored(): SetMap | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; sets: SetMap };
    return Date.now() - parsed.at < MAX_AGE_MS ? parsed.sets : null;
  } catch {
    return null;
  }
}

async function load(): Promise<SetMap | null> {
  const stored = readStored();
  if (stored) return stored;
  try {
    const res = await fetch("https://api.scryfall.com/sets", {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data: ScryfallSet[] };
    const sets: SetMap = {};
    for (const s of body.data) {
      sets[s.code.toUpperCase()] = {
        name: s.name,
        // Drop the cache-busting query; the path is what identifies the icon.
        icon: s.icon_svg_uri.split("?")[0],
        released: s.released_at,
      };
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ at: Date.now(), sets }));
    } catch {
      // Full or blocked storage just means refetching next visit.
    }
    return sets;
  } catch {
    return null;
  }
}

/** The set catalogue, or `null` until it has loaded (or if Scryfall is unreachable). */
export function useSets(): SetMap | null {
  const [sets, setSets] = useState<SetMap | null>(memory);

  useEffect(() => {
    if (memory) return;
    inflight ??= load();
    let live = true;
    void inflight.then((loaded) => {
      if (loaded) memory = loaded;
      else inflight = null; // allow a retry on the next mount
      if (live && loaded) setSets(loaded);
    });
    return () => {
      live = false;
    };
  }, []);

  return sets;
}
