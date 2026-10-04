"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { confirmResetPassword, resetPassword, signIn } from "aws-amplify/auth";
import { AuthCard, Field, FormError, FormNotice } from "@/components/auth/AuthForm";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { authErrorMessage, PASSWORD_RULES } from "@/lib/authClient";

function ResetFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useAuth();

  const [step, setStep] = useState<"request" | "reset">("request");
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await resetPassword({ username: email.trim() });
      // Worded the same whether or not the account exists, which is also what
      // Cognito does (prevent_user_existence_errors).
      setNotice(`If ${email.trim()} has an account, a reset code is on its way.`);
      setStep("reset");
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await confirmResetPassword({
        username: email.trim(),
        confirmationCode: code.trim(),
        newPassword: password,
      });
      // They just proved they own the account; don't make them type it all again.
      await signIn({ username: email.trim(), password });
      await refresh();
      router.replace("/");
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const footer = (
    <Link href="/login" className="text-foreground underline underline-offset-2">
      Back to sign in
    </Link>
  );

  if (step === "reset") {
    return (
      <AuthCard eyebrow="Reset password" title="Choose a new password" footer={footer}>
        <form onSubmit={reset} className="space-y-4">
          <FormNotice message={notice} />
          <Field
            label="Code from the email"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Field
            label="New password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            hint={PASSWORD_RULES}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <FormError message={error} />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Saving…" : "Save and sign in"}
          </Button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      eyebrow="Reset password"
      title="Forgot your password?"
      lead="Enter your email and we'll send you a code to set a new one."
      footer={footer}
    >
      <form onSubmit={requestCode} className="space-y-4">
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <FormError message={error} />
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Sending…" : "Send reset code"}
        </Button>
      </form>
    </AuthCard>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ResetFlow />
    </Suspense>
  );
}
