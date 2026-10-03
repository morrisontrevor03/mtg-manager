import { ZodError } from "zod";
import { UnauthorizedError } from "@/lib/auth";

// These helpers deliberately use the standard `Response` rather than
// `NextResponse`, so the route handlers in `src/app/api/**` can be imported and
// executed outside Next.js — the AWS Lambda bundle in `lambda/` reuses them
// verbatim. Next route handlers accept a plain `Response` return value.

export function ok<T>(data: T, init?: ResponseInit) {
  return Response.json(data, init);
}

export function badRequest(message: string, extra?: Record<string, unknown>) {
  return Response.json({ error: message, ...extra }, { status: 400 });
}

export function serverError(message: string) {
  return Response.json({ error: message }, { status: 500 });
}

export function notFound(message = "Not found") {
  return Response.json({ error: message }, { status: 404 });
}

export function serviceUnavailable(message: string) {
  return Response.json({ error: message }, { status: 503 });
}

/** Wrap a route handler so thrown errors become clean JSON responses. */
export function handle(fn: () => Promise<Response>): Promise<Response> {
  return fn().catch((err: unknown) => {
    if (err instanceof UnauthorizedError) {
      return Response.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof ZodError) {
      return badRequest("Invalid request body", { issues: err.issues });
    }
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error(err);
    return serverError(message);
  });
}
