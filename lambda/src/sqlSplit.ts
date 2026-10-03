/**
 * Split a Prisma migration file into individual SQL statements.
 *
 * Prisma issues statements over Postgres' extended protocol, which permits only
 * one per call, so a migration file cannot be sent verbatim. The scanner skips
 * delimiters inside single-quoted literals, double-quoted identifiers,
 * dollar-quoted bodies, and both comment styles.
 */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let start = 0;
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];

    if (ch === "-" && sql[i + 1] === "-") {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl + 1;
    } else if (ch === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
    } else if (ch === "'" || ch === '"') {
      const quote = ch;
      i += 1;
      while (i < sql.length) {
        if (sql[i] !== quote) {
          i += 1;
        } else if (sql[i + 1] === quote) {
          i += 2; // a doubled quote is an escaped quote, not the end
        } else {
          break;
        }
      }
      i += 1;
    } else if (ch === "$") {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (tag) {
        const end = sql.indexOf(tag[0], i + tag[0].length);
        i = end === -1 ? sql.length : end + tag[0].length;
      } else {
        i += 1;
      }
    } else if (ch === ";") {
      const stmt = sql.slice(start, i).trim();
      if (stmt) out.push(stmt);
      i += 1;
      start = i;
    } else {
      i += 1;
    }
  }

  const tail = sql.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}
