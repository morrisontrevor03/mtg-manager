// The route table for the Lambda deployment.
//
// Every entry delegates to the *same* App Router handler that `next dev` serves,
// imported straight from `src/app/api/**`. There is no second copy of the request
// logic here: this file only maps a route key onto an existing handler.

import { serviceUnavailable } from "@/lib/http";
import { ROUTE_KEYS, type RouteKey } from "./routeKeys";

import * as cardsSearch from "@/app/api/cards/search/route.api";
import * as cardsMatch from "@/app/api/cards/match/route.api";
import * as collection from "@/app/api/collection/route.api";
import * as collectionItem from "@/app/api/collection/[id]/route.api";
import * as collectionImport from "@/app/api/collection/import/route.api";
import * as collectionCommanders from "@/app/api/collection/commanders/route.api";
import * as dashboard from "@/app/api/dashboard/route.api";
import * as decks from "@/app/api/decks/route.api";
import * as deck from "@/app/api/decks/[id]/route.api";

/** Params arrive already resolved; Next's handlers expect a promise for them. */
export type RouteContext = { params: Promise<Record<string, string>> };

export type RouteHandler = (req: Request, ctx: RouteContext) => Promise<Response> | Response;

/**
 * The LLM deck builder is switched off in the deployed backend (see
 * `enable_deck_builder` in infra/variables.tf). It is the one route that cannot
 * fit inside API Gateway's hard 29-second integration timeout, and it is being
 * rebuilt. The real handler is imported lazily so a disabled deployment never
 * constructs the Anthropic client.
 */
const deckBuild: RouteHandler = async (req) => {
  if (process.env.ENABLE_DECK_BUILDER !== "true") {
    return serviceUnavailable(
      "The LLM deck builder is disabled in this deployment. " +
        "Set enable_deck_builder = true in your Terraform variables to turn it back on.",
    );
  }
  const mod = await import("@/app/api/decks/build/route.api");
  return mod.POST(req);
};

/**
 * Typed as `Record<RouteKey, …>`, so adding a key to `routeKeys.ts` without a
 * handler — or a handler without a key — is a type error rather than a 404 found
 * in production.
 */
export const routes: Record<RouteKey, RouteHandler> = {
  "GET /api/cards/search": cardsSearch.GET,
  "POST /api/cards/match": cardsMatch.POST,

  "GET /api/dashboard": dashboard.GET as RouteHandler,

  "GET /api/collection": collection.GET,
  "POST /api/collection": collection.POST,
  "GET /api/collection/commanders": collectionCommanders.GET as RouteHandler,
  "POST /api/collection/import": collectionImport.POST,
  "PATCH /api/collection/{id}": collectionItem.PATCH as RouteHandler,
  "DELETE /api/collection/{id}": collectionItem.DELETE as RouteHandler,

  "GET /api/decks": decks.GET as RouteHandler,
  "POST /api/decks/build": deckBuild,
  "GET /api/decks/{id}": deck.GET as RouteHandler,
  "PATCH /api/decks/{id}": deck.PATCH as RouteHandler,
  "DELETE /api/decks/{id}": deck.DELETE as RouteHandler,
};

// Fails the build if the two lists ever drift apart in length.
const _exhaustive: readonly RouteKey[] = ROUTE_KEYS;
void _exhaustive;
