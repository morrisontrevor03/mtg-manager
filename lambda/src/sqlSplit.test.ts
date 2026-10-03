import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { splitStatements } from "./sqlSplit";

describe("splitStatements", () => {
  it("splits on top-level semicolons and drops empties", () => {
    expect(splitStatements("SELECT 1; SELECT 2;;")).toEqual(["SELECT 1", "SELECT 2"]);
  });

  it("keeps a trailing statement with no semicolon", () => {
    expect(splitStatements("SELECT 1")).toEqual(["SELECT 1"]);
  });

  it("ignores semicolons inside string literals", () => {
    expect(splitStatements("INSERT INTO t VALUES ('a;b'); SELECT 1")).toEqual([
      "INSERT INTO t VALUES ('a;b')",
      "SELECT 1",
    ]);
  });

  it("handles doubled quotes as escapes", () => {
    expect(splitStatements("SELECT 'it''s; fine'; SELECT 2")).toEqual([
      "SELECT 'it''s; fine'",
      "SELECT 2",
    ]);
  });

  it("ignores semicolons inside quoted identifiers", () => {
    expect(splitStatements('ALTER TABLE "we;ird" ADD c INT; SELECT 1')).toHaveLength(2);
  });

  it("ignores semicolons inside dollar-quoted bodies", () => {
    const sql = "CREATE FUNCTION f() RETURNS int AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql; SELECT 1";
    expect(splitStatements(sql)).toHaveLength(2);
  });

  it("does not split on a semicolon inside a comment", () => {
    // Comments stay attached to the statement they precede, which Postgres
    // accepts; what matters is that their semicolons are not delimiters.
    expect(splitStatements("-- a; comment\nSELECT 1; /* b; c */ SELECT 2")).toEqual([
      "-- a; comment\nSELECT 1",
      "/* b; c */ SELECT 2",
    ]);
  });

  it("parses the project's real migrations into non-empty statements", () => {
    const dir = join(import.meta.dirname, "..", "..", "prisma", "migrations");
    const names = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    expect(names.length).toBeGreaterThan(0);

    for (const name of names) {
      const sql = readFileSync(join(dir, name, "migration.sql"), "utf8");
      const statements = splitStatements(sql);
      expect(statements.length).toBeGreaterThan(0);
      for (const s of statements) {
        expect(s.trim()).not.toBe("");
        expect(s).not.toContain(";\n"); // no un-split statement boundaries left
      }
    }
  });
});
