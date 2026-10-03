"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { autoSignIn, confirmSignUp, resendSignUpCode, signUp } from "aws-amplify/auth";
import {
  AuthCard,
  Field,
  FormError,
  FormNotice,
  GoogleSignIn,
} from "@/components/auth/AuthForm";
import { useAuth } from "@/components/auth/AuthProvider";
import { authErrorMessage, PASSWORD_RULES } from "@/lib/authClient";

function SignupFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const { status, refresh } = useAuth();

  // `?confirm=<email>` resumes an account that was created but never verified.
  const resumeEmail = params.get("confirm");
  const [step, setStep] = useState<"details" | "confirm">(resumeEmail ? "confirm" : "details");
  const [email, setEmail] = useState(resumeEmail ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "signedIn") router.replace("/");
  }, [status, router]);

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("The passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const { nextStep } = await signUp({
        username: email.trim(),
        password,
        options: { userAttributes: { email: email.trim() }, autoSignIn: true },
      });
      if (nextStep.signUpStep === "CONFIRM_SIGN_UP") {
        setStep("confirm");
        setNotice(`We sent a 6-digit code to ${email.trim()}.`);
      } else {
        await finish(nextStep.signUpStep);
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { nextStep } = await confirmSignUp({
        username: email.trim(),
        confirmationCode: code.trim(),
      });
      await finish(nextStep.signUpStep);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  /** Sign straight in when Cognito allows it; otherwise send them to /login. */
  async function finish(signUpStep: string) {
    if (signUpStep === "COMPLETE_AUTO_SIGN_IN") {
      try {
        await autoSignIn();
        await refresh();
        router.replace("/");
        return;
      } catch {
        // Auto sign-in only works in the tab that started the sign-up; fall through.
      }
    }
    router.replace(`/login?email=${encodeURIComponent(email.trim())}`);
  }

  async function resend() {
    setError(null);
    setNotice(null);
    try {
      await resendSignUpCode({ username: email.trim() });
      setNotice(`A new code is on its way to ${email.trim()}.`);
    } catch (err) {
      setError(authErrorMessage(err));
    }
  }

  const footer = (
    <>
      Already have an account?{" "}
      <Link href="/login" className="text-foreground underline underline-offset-2">
        Sign in
      </Link>
    </>
  );

  if (step === "confirm") {
    return (
      <AuthCard
        eyebrow="One more step"
        title="Check your email"
        lead={
          <>
            Enter the code sent to <span className="text-foreground">{email}</span> to finish
            creating your account.
          </>
        }
        footer={footer}
      >
        <form onSubmit={confirm} className="space-y-4">
          <Field
            label="Verification code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <FormNotice message={notice} />
          <FormError message={error} />
          <button className="btn w-full" disabled={busy}>
            {busy ? "Verifying…" : "Verify and continue"}
          </button>
          <p className="text-center text-sm">
            <button
              type="button"
              onClick={resend}
              className="text-muted underline decoration-dotted underline-offset-2 hover:text-foreground"
            >
              Send a new code
            </button>
          </p>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      eyebrow="Get started"
      title="Create your account"
      lead="Your collection and decks are private to your account."
      footer={footer}
    >
      <GoogleSignIn onError={setError} />
      <form onSubmit={createAccount} className="space-y-4">
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
          autoComplete="new-password"
          required
          minLength={10}
          hint={PASSWORD_RULES}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Field
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        <FormError message={error} />
        <button className="btn w-full" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthCard>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupFlow />
    </Suspense>
  );
}
