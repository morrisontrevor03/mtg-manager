import { describe, expect, it, vi } from "vitest";

// The handler module constructs a PrismaClient at import time; none of these
// tests touch the database.
vi.mock("@/lib/db", () => ({ db: {} }));

const { toRequest } = await import("./handler");
const { USER_ID_HEADER } = await import("@/lib/auth");

describe("toRequest identity header", () => {
  it("sets the user from the verified JWT claims", () => {
    const req = toRequest(
      {
        headers: { host: "example.com" },
        requestContext: { authorizer: { jwt: { claims: { sub: "user-123" } } } },
      },
      "GET",
      "/api/collection",
    );
    expect(req.headers.get(USER_ID_HEADER)).toBe("user-123");
  });

  it("drops a spoofed header when there are no verified claims", () => {
    const req = toRequest(
      { headers: { host: "example.com", [USER_ID_HEADER]: "someone-else" } },
      "GET",
      "/api/collection",
    );
    expect(req.headers.get(USER_ID_HEADER)).toBeNull();
  });

  it("replaces a spoofed header with the verified one", () => {
    const req = toRequest(
      {
        headers: { host: "example.com", [USER_ID_HEADER.toUpperCase()]: "someone-else" },
        requestContext: { authorizer: { jwt: { claims: { sub: "user-123" } } } },
      },
      "GET",
      "/api/collection",
    );
    expect(req.headers.get(USER_ID_HEADER)).toBe("user-123");
  });
});
