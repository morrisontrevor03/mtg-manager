import { describe, expect, it } from "vitest";
import { matchRoute } from "./match";
import { ROUTE_KEYS } from "./routeKeys";

/** The real route surface, with each key standing in for its handler. */
const table = Object.fromEntries(ROUTE_KEYS.map((k) => [k, k]));

describe("matchRoute", () => {
  it("matches a literal route", () => {
    expect(matchRoute(table, "GET", "/api/collection")?.key).toBe("GET /api/collection");
  });

  it("extracts a path parameter", () => {
    const m = matchRoute(table, "PATCH", "/api/collection/clx123abc");
    expect(m?.key).toBe("PATCH /api/collection/{id}");
    expect(m?.params).toEqual({ id: "clx123abc" });
  });

  it("prefers a literal route over a parameterised sibling", () => {
    // Without literal-first precedence this could resolve to POST /api/decks/{id}.
    expect(matchRoute(table, "POST", "/api/decks/build")?.key).toBe("POST /api/decks/build");
    expect(matchRoute(table, "POST", "/api/collection/import")?.key).toBe(
      "POST /api/collection/import",
    );
  });

  it("distinguishes methods on the same path", () => {
    expect(matchRoute(table, "GET", "/api/decks/abc")?.key).toBe("GET /api/decks/{id}");
    expect(matchRoute(table, "DELETE", "/api/decks/abc")?.key).toBe("DELETE /api/decks/{id}");
    expect(matchRoute(table, "PUT", "/api/decks/abc")).toBeNull();
  });

  it("ignores a trailing slash", () => {
    expect(matchRoute(table, "GET", "/api/collection/")?.key).toBe("GET /api/collection");
  });

  it("percent-decodes parameters", () => {
    expect(matchRoute(table, "GET", "/api/decks/a%2Fb")?.params).toEqual({ id: "a/b" });
  });

  it("does not match across segment boundaries", () => {
    expect(matchRoute(table, "GET", "/api/decks/abc/extra")).toBeNull();
    expect(matchRoute(table, "GET", "/api/decks//")).toBeNull();
  });

  it("returns null for unknown paths", () => {
    expect(matchRoute(table, "GET", "/api/nope")).toBeNull();
    expect(matchRoute(table, "GET", "/")).toBeNull();
  });

  it("is not fooled by inherited object properties", () => {
    // A bare `table[key]` lookup would match "GET /api/constructor" style paths.
    expect(matchRoute(table, "GET", "/api/__proto__")).toBeNull();
  });
});
