"use client";

import { useId, useState, type ReactNode } from "react";
import { signInWithRedirect } from "aws-amplify/auth";
import { GoogleIcon } from "@/components/icons";
import { useAuth } from "@/components/auth/AuthProvider";
import { authErrorMessage } from "@/lib/authClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

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
      <Card className="gap-0 p-7">
        <p className="text-sm text-muted-foreground">{eyebrow}</p>
        <h1 className="display mt-1 text-2xl font-semibold">{title}</h1>
        {lead && <p className="mt-1.5 text-sm text-muted-foreground">{lead}</p>}
        <div className="mt-6">{children}</div>
      </Card>
      {footer && <div className="mt-4 text-center text-sm text-muted-foreground">{footer}</div>}
    </div>
  );
}

/** A labelled input. Labels sit above the field so they survive autofill. */
export function Field({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & React.ComponentProps<typeof Input>) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="font-normal text-muted-foreground">
        {label}
      </Label>
      <Input id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...input} />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-faint-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

export function FormNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="status" className="text-sm text-success">
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
      <Button
        type="button"
        variant="outline"
        className="w-full"
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
      </Button>
      <div className="my-5 flex items-center gap-3 text-xs text-faint-foreground" aria-hidden>
        <Separator className="flex-1" />
        or with email
        <Separator className="flex-1" />
      </div>
    </>
  );
}
