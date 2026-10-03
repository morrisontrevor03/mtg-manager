"use client";

import { Amplify } from "aws-amplify";
import { fetchAuthSession } from "aws-amplify/auth";
// Completes the Google redirect flow when the browser lands back on
// /auth/callback. Amplify requires this import in multi-page apps.
import "aws-amplify/auth/enable-oauth-listener";

/**
 * Browser side of authentication.
 *
 * The static frontend is built before Terraform creates the user pool, so the
 * pool ids cannot be baked in. They come from `/auth-config.json` instead, which
 * Terraform uploads next to the site (and `npm run auth:config` writes into
 * public/ for `next dev`).
 */

export interface AuthConfig {
  region: string;
  userPoolId: string;
  userPoolClientId: string;
  oauthDomain: string;
  googleEnabled: boolean;
}

// The static export uses directory-style URLs; `next dev` does not. Cognito
// compares redirect URIs exactly, so the callback has to match the mode.
const SLASH = process.env.NEXT_PUBLIC_TRAILING_SLASH === "1" ? "/" : "";

let configPromise: Promise<AuthConfig> | null = null;

/** Fetch the config and configure Amplify, once per page load. */
export function loadAuthConfig(): Promise<AuthConfig> {
  configPromise ??= fetch("/auth-config.json", { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(
          "Sign-in is not configured (auth-config.json is missing). " +
            "Locally, run `npm run auth:config`.",
        );
      }
      const config = (await res.json()) as AuthConfig;
      const origin = window.location.origin;

      Amplify.configure({
        Auth: {
          Cognito: {
            userPoolId: config.userPoolId,
            userPoolClientId: config.userPoolClientId,
            loginWith: {
              email: true,
              oauth: {
                domain: config.oauthDomain,
                scopes: ["openid", "email", "profile"],
                redirectSignIn: [`${origin}/auth/callback${SLASH}`],
                redirectSignOut: [`${origin}/login${SLASH}`],
                responseType: "code",
              },
            },
          },
        },
      });
      return config;
    })
    .catch((err) => {
      // Let a later call retry, e.g. after `npm run auth:config` in development.
      configPromise = null;
      throw err;
    });
  return configPromise;
}

// --- API calls ------------------------------------------------------------

/** Fired when the API rejects the session, so the app can send the user to /login. */
export const UNAUTHORIZED_EVENT = "mtg:unauthorized";

/**
 * `fetch` for `/api/*`, with the signed-in user's access token attached.
 * Amplify refreshes an expired access token from the refresh token on the way.
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  await loadAuthConfig();

  let token: string | undefined;
  try {
    token = (await fetchAuthSession()).tokens?.accessToken?.toString();
  } catch {
    token = undefined;
  }

  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);

  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  return res;
}

// --- Errors ---------------------------------------------------------------

const MESSAGES: Record<string, string> = {
  NotAuthorizedException: "Incorrect email or password.",
  UserNotFoundException: "Incorrect email or password.",
  UsernameExistsException: "An account with this email already exists. Try signing in.",
  CodeMismatchException: "That code isn't right. Check the email and try again.",
  ExpiredCodeException: "That code has expired. Request a new one.",
  LimitExceededException: "Too many attempts. Wait a few minutes and try again.",
  TooManyRequestsException: "Too many attempts. Wait a few minutes and try again.",
  TooManyFailedAttemptsException: "Too many attempts. Wait a few minutes and try again.",
  UserAlreadyAuthenticatedException: "You're already signed in.",
  EmptySignInUsername: "Enter your email address.",
  EmptySignInPassword: "Enter your password.",
  EmptySignUpUsername: "Enter your email address.",
  EmptySignUpPassword: "Choose a password.",
  EmptyConfirmSignUpCode: "Enter the code from the email.",
  EmptyResetPasswordUsername: "Enter your email address.",
  EmptyConfirmResetPasswordConfirmationCode: "Enter the code from the email.",
  EmptyConfirmResetPasswordNewPassword: "Choose a new password.",
};

/** A sentence a person can act on, from whatever Amplify or Cognito threw. */
export function authErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "name" in err) {
    const name = String((err as { name: unknown }).name);
    if (MESSAGES[name]) return MESSAGES[name];
    // Cognito's password-policy messages are already specific and readable.
    if (name === "InvalidPasswordException" || name === "InvalidParameterException") {
      const message = (err as { message?: unknown }).message;
      if (typeof message === "string" && message) return message.replace(/^.*?:\s*/, "");
    }
  }
  return err instanceof Error && err.message ? err.message : "Something went wrong. Try again.";
}

/** Where to go after signing in: the `next` param if it is a local path, else home. */
export function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export const PASSWORD_RULES = "At least 10 characters, with a lowercase letter and a number.";
