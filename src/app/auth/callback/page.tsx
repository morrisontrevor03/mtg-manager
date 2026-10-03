"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Hub } from "aws-amplify/utils";
import { AuthCard } from "@/components/auth/AuthForm";
import { useAuth } from "@/components/auth/AuthProvider";
import { authErrorMessage } from "@/lib/authClient";

/**
 * Where Google sends the browser back to. Amplify's OAuth listener (imported in
 * authClient) exchanges the code for tokens on its own; this page only waits
 * for the outcome.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const { status } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "signedIn") router.replace("/");
  }, [status, router]);

  useEffect(
    () =>
      Hub.listen("auth", ({ payload }) => {
        if (payload.event === "signInWithRedirect_failure") {
          setError(authErrorMessage(payload.data?.error));
        }
      }),
    [],
  );

  return (
    <AuthCard
      eyebrow="Google"
      title={error ? "Sign-in didn't complete" : "Signing you in…"}
      lead={error ?? "Hold on a moment while we finish connecting your Google account."}
    >
      {error && (
        <Link href="/login" className="btn w-full">
          Back to sign in
        </Link>
      )}
    </AuthCard>
  );
}
