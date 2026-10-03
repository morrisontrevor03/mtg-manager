// Applies Prisma migrations to the RDS instance from inside the VPC.
//
// RDS lives in private subnets with no public endpoint, so `prisma migrate
// deploy` cannot be run from a laptop without a bastion. This Lambda is built
// from the same bundle as the API and applies the SQL in `prisma/migrations/**`
// directly, keeping Prisma's own `_prisma_migrations` ledger so that a later
// `migrate deploy` from a developer machine stays consistent with what ran here.

import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/lib/db";
import { splitStatements } from "./sqlSplit";

/** Where `build.mjs` stages the migration SQL inside the deployment package. */
const MIGRATIONS_DIR = join(__dirname, "migrations");

// Prisma's own ledger DDL, so this runner and the Prisma CLI agree on state.
const LEDGER_DDL = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id"                  VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum"            VARCHAR(64) NOT NULL,
  "finished_at"         TIMESTAMPTZ,
  "migration_name"      VARCHAR(255) NOT NULL,
  "logs"                TEXT,
  "rolled_back_at"      TIMESTAMPTZ,
  "started_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)`;

interface MigrationFile {
  name: string;
  sql: string;
  checksum: string;
}

function readMigrations(): MigrationFile[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort() // timestamp-prefixed names sort chronologically
    .map((name) => {
      const sql = readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");
      return {
        name,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    });
}

export interface MigrateResult {
  applied: string[];
  skipped: string[];
}

export async function handler(): Promise<MigrateResult> {
  await db.$executeRawUnsafe(LEDGER_DDL);

  const done = await db.$queryRawUnsafe<{ migration_name: string }[]>(
    `SELECT "migration_name" FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL`,
  );
  const alreadyApplied = new Set(done.map((r) => r.migration_name));

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const migration of readMigrations()) {
    if (alreadyApplied.has(migration.name)) {
      skipped.push(migration.name);
      continue;
    }

    const statements = splitStatements(migration.sql);
    console.log(`applying ${migration.name} (${statements.length} statements)`);

    // One transaction per migration: a failure leaves no partial schema and no
    // ledger row, so the next invocation retries it cleanly.
    await db.$transaction(async (tx) => {
      for (const stmt of statements) await tx.$executeRawUnsafe(stmt);
      await tx.$executeRawUnsafe(
        `INSERT INTO "_prisma_migrations"
           ("id", "checksum", "migration_name", "started_at", "finished_at", "applied_steps_count")
         VALUES ($1, $2, $3, now(), now(), $4)`,
        randomUUID(),
        migration.checksum,
        migration.name,
        statements.length,
      );
    });

    applied.push(migration.name);
  }

  console.log(`migrations complete: ${applied.length} applied, ${skipped.length} already present`);
  return { applied, skipped };
}
