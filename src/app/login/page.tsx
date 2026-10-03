"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "aws-amplify/auth";
import { AuthCard, Field, FormError, GoogleSignIn } from "@/components/auth/AuthForm";
import { useAuth } from "@/components/auth/AuthProvider";
import { authErrorMessage, safeNext } from "@/lib/authClient";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { status, refresh } = useAuth();

  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in (e.g. the back button): nothing to do here.
  useEffect(() => {
    if (status === "signedIn") router.replace(next);
  }, [status, next, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { nextStep } = await signIn({ username: email.trim(), password });

      if (nextStep.signInStep === "CONFIRM_SIGN_UP") {
        // Signed up but never entered the emailed code.
        router.push(`/signup?confirm=${encodeURIComponent(email.trim())}`);
        return;
      }
      if (nextStep.signInStep !== "DONE") {
        setError("This account needs a step this app doesn't support yet.");
        return;
      }
      await refresh();
      router.replace(next);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      eyebrow="Welcome back"
      title="Sign in"
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="text-foreground underline underline-offset-2">
            Create an account
          </Link>
        </>
      }
    >
      <GoogleSignIn onError={setError} />
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <FormError message={error} />
        <button className="btn w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-center text-sm">
          <Link
            href={`/forgot-password${email ? `?email=${encodeURIComponent(email.trim())}` : ""}`}
            className="text-muted underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            Forgot your password?
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary in a statically exported page.
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
