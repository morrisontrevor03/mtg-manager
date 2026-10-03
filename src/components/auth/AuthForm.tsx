"use client";

import { useState, type ReactNode } from "react";
import { signInWithRedirect } from "aws-amplify/auth";
import { GoogleIcon } from "@/components/icons";
import { useAuth } from "@/components/auth/AuthProvider";
import { authErrorMessage } from "@/lib/authClient";

/** The centred card every sign-in page sits in. */
export function AuthCard({
  eyebrow,
  title,
  lead,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="ink-in mx-auto w-full max-w-sm pt-6">
      <div className="card p-7">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display mt-1.5 text-2xl font-semibold">{title}</h1>
        {lead && <p className="mt-1.5 text-sm text-muted">{lead}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-4 text-center text-sm text-muted">{footer}</div>}
    </div>
  );
}

/** A labelled input. Labels sit above the field so they survive autofill. */
export function Field({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-muted">{label}</span>
      <input className="input" {...input} />
      {hint && <span className="mt-1 block text-xs text-muted-dim">{hint}</span>}
    </label>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-[color:var(--danger)]">
      {message}
    </p>
  );
}

export function FormNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="status" className="text-sm text-[color:var(--success)]">
      {message}
    </p>
  );
}

/**
 * "Continue with Google", plus the divider above the password form. Renders
 * nothing until Google sign-in is configured for the deployment.
 */
export function GoogleSignIn({ onError }: { onError: (message: string) => void }) {
  const { config } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!config?.googleEnabled) return null;

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            // Leaves the page for Google, and comes back to /auth/callback.
            await signInWithRedirect({ provider: "Google" });
          } catch (err) {
            onError(authErrorMessage(err));
            setBusy(false);
          }
        }}
      >
        <GoogleIcon />
        {busy ? "Redirecting…" : "Continue with Google"}
      </button>
      <div className="my-5 flex items-center gap-3 text-xs text-muted-dim" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        or with email
        <span className="h-px flex-1 bg-border" />
      </div>
    </>
  );
}
