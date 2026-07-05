/**
 * Idempotent schema migration runner.
 *
 * Reads db/schema.sql and applies each statement to Neon. All DDL is
 * CREATE ... IF NOT EXISTS, so running this repeatedly is safe (KTD-2 /
 * crypto-books migrations.py idempotent-DDL style).
 *
 * Neon's HTTP driver runs one statement per round-trip, so we split the file
 * on statement boundaries. schema.sql intentionally contains no PL/pgSQL
 * bodies or string-embedded semicolons, so a simple split is correct here.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { requireSql } from "./client";

/**
 * Split raw SQL into executable statements.
 *
 * Strips `--` line comments first, then splits on `;`. This avoids a semicolon
 * inside a comment (e.g. "-- nft; NULL for token") being mistaken for a
 * statement boundary. schema.sql contains no string literals with embedded
 * `--` or `;`, so line-comment stripping is safe here.
 */
export function splitStatements(sql: string): string[] {
  const withoutComments = sql
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
  return withoutComments
    .split(";")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk !== "");
}

export async function migrate(): Promise<number> {
  const sql = requireSql();
  const schemaPath = resolve(process.cwd(), "db/schema.sql");
  const statements = splitStatements(readFileSync(schemaPath, "utf8"));
  for (const stmt of statements) {
    await sql.query(stmt);
  }
  return statements.length;
}

// Run when invoked directly (npm run migrate).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("migrate.ts")) {
  migrate()
    .then((n) => {
      console.log(`Applied ${n} statements from schema.sql`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
