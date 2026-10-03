"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Client-side data loading for the statically exported frontend.
 *
 * The pages used to be server components that queried Prisma directly. The
 * static export has no server, so each one now fetches from `/api/*` instead.
 * Paths stay relative: `next dev` serves those routes locally, and in production
 * CloudFront routes `/api/*` to API Gateway on the same origin — so there is no
 * base URL to configure and no CORS involved.
 */

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Re-run the request, e.g. after a mutation elsewhere on the page. */
  reload: () => void;
}

interface Settled<T> {
  /** Which request this result belongs to, so a stale one is never shown. */
  key: string;
  data: T | null;
  error: string | null;
}

/** Pass `null` to skip fetching, e.g. while a required query param is missing. */
export function useApi<T>(path: string | null): ApiState<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const key = path === null ? "" : `${nonce}\u0000${path}`;

  useEffect(() => {
    if (path === null) return;

    // A page can unmount or change its query mid-flight; ignore late arrivals.
    const controller = new AbortController();

    fetch(path, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
        setSettled({ key, data: body as T, error: null });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setSettled({
          key,
          data: null,
          error: err instanceof Error ? err.message : "Something went wrong",
        });
      });

    return () => controller.abort();
  }, [path, key]);

  // Derived rather than stored: a result is current only when it belongs to the
  // request the caller is asking for, which also means no setState in the effect
  // body and so no cascading render on mount.
  const current = settled?.key === key ? settled : null;

  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: path !== null && current === null,
    reload,
  };
}
