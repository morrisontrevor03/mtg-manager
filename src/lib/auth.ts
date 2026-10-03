import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Who is calling: the Cognito `sub` of the signed-in user.
 *
 * Tokens are verified in one of two places, depending on where the route
 * handler is running:
 *
 * - **On Lambda** (`AUTH_MODE=gateway`), API Gateway's JWT authorizer has already
 *   checked the access token's signature, expiry, issuer and client before the
 *   function is invoked. The Lambda handler copies the verified `sub` into the
 *   USER_ID_HEADER after deleting any copy the caller sent, so the header can
 *   only ever hold a value the gateway vouched for.
 * - **Under `next dev`**, there is no gateway, so the bearer token is verified
 *   here against the same user pool, using `public/auth-config.json`.
 */

export const USER_ID_HEADER = "x-mtg-user-id";

export class UnauthorizedError extends Error {
  constructor(message = "Sign in to continue.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function requireUser(req: Request): Promise<string> {
  if (process.env.AUTH_MODE === "gateway") {
    const userId = req.headers.get(USER_ID_HEADER);
    if (!userId) throw new UnauthorizedError();
    return userId;
  }

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new UnauthorizedError();

  const verifier = await localVerifier();
  try {
    const payload = await verifier.verify(token);
    return payload.sub;
  } catch {
    throw new UnauthorizedError("Your session has expired. Sign in again.");
  }
}

// --- Local development ----------------------------------------------------

interface AuthConfig {
  userPoolId: string;
  userPoolClientId: string;
}

type Verifier = { verify(token: string): Promise<{ sub: string }> };
let verifier: Promise<Verifier> | undefined;

function localVerifier(): Promise<Verifier> {
  verifier ??= (async () => {
    let config: AuthConfig;
    try {
      config = JSON.parse(readFileSync(join(process.cwd(), "public", "auth-config.json"), "utf8"));
    } catch {
      throw new Error(
        "public/auth-config.json is missing. Run `npm run auth:config` to fetch it from the deployed stack.",
      );
    }
    // Imported lazily: the Lambda bundle never takes this path.
    const { CognitoJwtVerifier } = await import("aws-jwt-verify");
    return CognitoJwtVerifier.create({
      userPoolId: config.userPoolId,
      clientId: config.userPoolClientId,
      tokenUse: "access",
    });
  })();
  // A failed setup (missing config) should be retried on the next request,
  // once the developer has fixed it, rather than cached forever.
  verifier.catch(() => {
    verifier = undefined;
  });
  return verifier;
}
