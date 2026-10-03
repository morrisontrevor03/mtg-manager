// AWS Lambda entry point for the MTG Manager backend.
//
// API Gateway (HTTP API, payload format 2.0) proxies every `/api/*` request
// here. This module's only job is translation: event -> WHATWG `Request`,
// dispatch through `routes.ts` to the real App Router handler, then
// `Response` -> API Gateway result. All business logic stays in `src/`.

import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { matchRoute } from "./match";
import { routes } from "./routes";

// --- API Gateway v2 payload (only the fields we use) ----------------------

interface ApiGatewayV2Event {
  version?: string;
  routeKey?: string;
  rawPath?: string;
  rawQueryString?: string;
  headers?: Record<string, string | undefined>;
  cookies?: string[];
  body?: string;
  isBase64Encoded?: boolean;
  pathParameters?: Record<string, string | undefined>;
  requestContext?: {
    requestId?: string;
    http?: { method?: string; path?: string };
  };
}

interface LambdaResult {
  statusCode: number;
  headers: Record<string, string>;
  cookies?: string[];
  body: string;
  isBase64Encoded: boolean;
}

// --- Event <-> Request/Response -------------------------------------------

function toRequest(event: ApiGatewayV2Event, method: string, path: string): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(event.headers ?? {})) {
    if (value !== undefined) headers.set(name, value);
  }
  if (event.cookies?.length) headers.set("cookie", event.cookies.join("; "));

  const host = headers.get("host") ?? "localhost";
  const query = event.rawQueryString ? `?${event.rawQueryString}` : "";
  const url = `https://${host}${path}${query}`;

  // GET/HEAD must not carry a body, and a base64 payload (file uploads on the
  // CSV import route) has to reach the handler as bytes, not as text.
  let body: BodyInit | undefined;
  if (event.body !== undefined && method !== "GET" && method !== "HEAD") {
    // A Buffer is an ArrayBufferView and a perfectly good BodyInit at runtime,
    // but the DOM lib's BodyInit union this project compiles against omits it.
    body = event.isBase64Encoded
      ? (Buffer.from(event.body, "base64") as unknown as BodyInit)
      : event.body;
  }

  return new Request(url, { method, headers, body });
}

async function toResult(res: Response): Promise<LambdaResult> {
  const headers: Record<string, string> = {};
  const cookies: string[] = [];
  res.headers.forEach((value, name) => {
    if (name.toLowerCase() === "set-cookie") cookies.push(value);
    else headers[name] = value;
  });

  const contentType = res.headers.get("content-type") ?? "";
  const isText =
    contentType.startsWith("text/") ||
    contentType.includes("json") ||
    contentType.includes("xml") ||
    contentType.includes("charset");

  const buffer = Buffer.from(await res.arrayBuffer());

  return {
    statusCode: res.status,
    headers,
    ...(cookies.length ? { cookies } : {}),
    body: isText ? buffer.toString("utf8") : buffer.toString("base64"),
    isBase64Encoded: !isText,
  };
}

function json(statusCode: number, data: unknown): LambdaResult {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
    isBase64Encoded: false,
  };
}

// --- Authentication -------------------------------------------------------

/**
 * The app has no user accounts, so the deployed API is protected by an optional
 * shared secret (`api_shared_secret` in Terraform). When it is unset the API is
 * open to anyone who learns the URL, including the routes that write to the
 * collection.
 */
function isAuthorised(headers: Record<string, string | undefined>): boolean {
  const expected = process.env.API_SHARED_SECRET;
  if (!expected) return true;

  // Header names arrive lower-cased in a v2 payload, but do not rely on it.
  const presented = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === "x-api-key",
  )?.[1];
  if (!presented) return false;

  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// --- Handler --------------------------------------------------------------

export async function handler(event: ApiGatewayV2Event): Promise<LambdaResult> {
  const method = (event.requestContext?.http?.method ?? "GET").toUpperCase();
  const path = event.rawPath ?? event.requestContext?.http?.path ?? "/";

  if (!isAuthorised(event.headers ?? {})) {
    return json(401, { error: "Missing or invalid x-api-key header." });
  }

  // A cheap liveness probe that proves the VPC wiring and RDS credentials work
  // without touching application tables.
  if (method === "GET" && (path === "/api/health" || path === "/health")) {
    try {
      await db.$queryRawUnsafe("SELECT 1");
      return json(200, { ok: true, database: "up" });
    } catch (err) {
      console.error("health check failed", err);
      return json(503, {
        ok: false,
        database: "down",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const match = matchRoute(routes, method, path);
  if (!match) return json(404, { error: `No route for ${method} ${path}` });

  try {
    const res = await match.value(toRequest(event, method, path), {
      params: Promise.resolve(match.params),
    });
    return await toResult(res);
  } catch (err) {
    // `handle()` already converts expected failures into JSON responses, so
    // anything surfacing here is unexpected.
    console.error(`unhandled error in ${method} ${path}`, err);
    return json(500, { error: err instanceof Error ? err.message : "Unexpected error" });
  }
}
