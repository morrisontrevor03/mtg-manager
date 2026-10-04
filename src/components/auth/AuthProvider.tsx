"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Hub } from "aws-amplify/utils";
import { fetchUserAttributes, getCurrentUser, signOut as amplifySignOut } from "aws-amplify/auth";
import { loadAuthConfig, UNAUTHORIZED_EVENT, type AuthConfig } from "@/lib/authClient";
import { LoadError, SkeletonLines } from "@/components/patterns";

type Status = "loading" | "signedIn" | "signedOut" | "error";

interface AuthState {
  status: Status;
  email: string | null;
  config: AuthConfig | null;
  error: string | null;
  /** Re-read the session, e.g. right after a sign-in completes. */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setConfig(await loadAuthConfig());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
      return;
    }
    try {
      await getCurrentUser();
      const attrs = await fetchUserAttributes().catch(() => ({}) as { email?: string });
      setEmail(attrs.email ?? null);
      setStatus("signedIn");
    } catch {
      setEmail(null);
      setStatus("signedOut");
    }
  }, []);

  const signOut = useCallback(async () => {
    await amplifySignOut().catch(() => undefined);
    setEmail(null);
    setStatus("signedOut");
  }, []);

  useEffect(() => {
    // Initial session check, deferred so the effect body itself sets no state.
    queueMicrotask(() => void refresh());

    const stopHub = Hub.listen("auth", ({ payload }) => {
      switch (payload.event) {
        case "signedIn":
        case "signInWithRedirect":
        case "signedOut":
        case "tokenRefresh_failure":
          void refresh();
      }
    });

    // The API turned the token down (revoked, or the account was deleted).
    const onUnauthorized = () => void signOut();
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);

    return () => {
      stopHub();
      window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    };
  }, [refresh, signOut]);

  return (
    <AuthContext.Provider value={{ status, email, config, error, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// --- Route guard ----------------------------------------------------------

/** Pages reachable without an account. */
const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/auth/callback"];

function isPublic(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return PUBLIC_PATHS.includes(path);
}

/**
 * Renders the app only for a signed-in user. Everyone else is sent to /login,
 * with the page they wanted kept in `next` so they land back on it.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, error } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const open = isPublic(pathname);

  useEffect(() => {
    if (status === "signedOut" && !open) {
      const next = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
      router.replace(`/login${next}`);
    }
  }, [status, open, pathname, router]);

  if (open) return <>{children}</>;
  if (status === "error") return <LoadError message={error ?? "Sign-in is unavailable."} />;
  if (status !== "signedIn") return <SkeletonLines lines={4} />;
  return <>{children}</>;
}
