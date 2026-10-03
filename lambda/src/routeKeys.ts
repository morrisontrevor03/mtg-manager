/**
 * The backend's public surface, as API Gateway route keys: `"<METHOD> <path>"`.
 *
 * This list is the single source of truth, consumed in three places:
 *  - `routes.ts` maps each key to the App Router handler that serves it
 *    (TypeScript fails the build if a key has no handler, or vice versa);
 *  - `handler.ts` matches incoming requests against it;
 *  - `infra/apigateway.tf` declares one `aws_apigatewayv2_route` per key.
 *
 * Keep the Terraform list in step when adding a route — `npm run lambda:check`
 * compares the two and fails if they have drifted.
 */
export const ROUTE_KEYS = [
  "GET /api/cards/search",
  "POST /api/cards/match",

  "GET /api/dashboard",

  "GET /api/collection",
  "POST /api/collection",
  "GET /api/collection/commanders",
  "POST /api/collection/import",
  "PATCH /api/collection/{id}",
  "DELETE /api/collection/{id}",

  "GET /api/decks",
  "POST /api/decks/build",
  "GET /api/decks/{id}",
  "PATCH /api/decks/{id}",
  "DELETE /api/decks/{id}",
] as const;

export type RouteKey = (typeof ROUTE_KEYS)[number];
