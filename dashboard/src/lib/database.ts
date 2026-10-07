import "server-only";

import { Pool, types, type PoolClient, type QueryResult } from "pg";

export type DatabaseStatement = {
  sql: string;
  args?: unknown[];
};

export type DatabaseResult = {
  rows: Record<string, unknown>[];
  rowsAffected: number;
};

const CONNECTION_TIMEOUT_MS = 8_000;
const QUERY_TIMEOUT_MS = 8_000;
let pool: Pool | null = null;

types.setTypeParser(types.builtins.INT8, (value) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error("Database integer exceeds JavaScript's safe integer range.");
  }
  return parsed;
});

function getPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    throw new Error("Supabase database connection is not configured.");
  }
  pool = new Pool({
    connectionString,
    max: 4,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: 10_000,
    query_timeout: QUERY_TIMEOUT_MS,
  });
  pool.on("error", (error) => {
    console.error("[database] idle PostgreSQL connection failed:", error);
  });
  return pool;
}

function replaceSqliteMetadataQuery(sql: string): string | null {
  const pragma = /^\s*PRAGMA\s+table_info\(\s*["']?([a-zA-Z_][\w-]*)["']?\s*\)\s*;?\s*$/i.exec(
    sql,
  );
  if (pragma) {
    return "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position";
  }

  if (/^\s*SELECT\s+name\s+FROM\s+sqlite_master\s+WHERE\s+type\s*=\s*'table'\s*;?\s*$/i.test(sql)) {
    return "SELECT tablename AS name FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename";
  }

  return null;
}

function replaceQuestionPlaceholders(sql: string): string {
  let result = "";
  let parameterIndex = 0;
  let quote: "'" | '"' | null = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    const next = sql[index + 1];

    if (lineComment) {
      result += character;
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      result += character;
      if (character === "*" && next === "/") {
        result += next;
        index += 1;
        blockComment = false;
      }
      continue;
    }
    if (quote) {
      result += character;
      if (character === quote) {
        if (next === quote) {
          result += next;
          index += 1;
        } else {
          quote = null;
        }
      } else if (character === "\\" && next) {
        result += next;
        index += 1;
      }
      continue;
    }

    if (character === "-" && next === "-") {
      result += "--";
      index += 1;
      lineComment = true;
    } else if (character === "/" && next === "*") {
      result += "/*";
      index += 1;
      blockComment = true;
    } else if (character === "'" || character === '"') {
      quote = character;
      result += character;
    } else if (character === "?") {
      parameterIndex += 1;
      result += `$${parameterIndex}`;
    } else {
      result += character;
    }
  }

  return result;
}

function adaptSql(sql: string, args: unknown[] = []): DatabaseStatement {
  const metadataQuery = replaceSqliteMetadataQuery(sql);
  if (metadataQuery) {
    const pragma = /^\s*PRAGMA\s+table_info\(\s*["']?([a-zA-Z_][\w-]*)["']?\s*\)/i.exec(
      sql,
    );
    return {
      sql: metadataQuery,
      args: pragma ? [pragma[1]] : [],
    };
  }

  const insertOrIgnore = /^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i.test(sql);
  let adaptedSql = sql.replace(
    /^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i,
    (match) => match.replace(/OR\s+IGNORE\s+/i, ""),
  );
  adaptedSql = replaceQuestionPlaceholders(adaptedSql);

  if (insertOrIgnore) {
    const returning = /\s+RETURNING\s+[\s\S]*$/i.exec(adaptedSql);
    const insertEnd = returning?.index ?? adaptedSql.length;
    const beforeReturning = adaptedSql.slice(0, insertEnd).trimEnd();
    const suffix = adaptedSql.slice(insertEnd);
    adaptedSql = `${beforeReturning} ON CONFLICT DO NOTHING${suffix}`;
  }

  return { sql: adaptedSql, args };
}

function toResult(result: QueryResult): DatabaseResult {
  return {
    rows: result.rows as Record<string, unknown>[],
    rowsAffected: result.rowCount ?? 0,
  };
}

async function executeOn(
  client: Pick<Pool, "query"> | Pick<PoolClient, "query">,
  statement: string | DatabaseStatement,
): Promise<DatabaseResult> {
  const input = typeof statement === "string" ? { sql: statement } : statement;
  const adapted = adaptSql(input.sql, input.args);
  const result = await client.query(adapted.sql, adapted.args);
  return toResult(result);
}

class PostgresDatabase {
  private legacySchemaMigration: Promise<void> | null = null;

  private async ensureLegacySchemaMigration(): Promise<void> {
    if (!this.legacySchemaMigration) {
      this.legacySchemaMigration = getPool()
        .query(`
          DO $migration$
          BEGIN
            IF to_regclass('public.ai_context_preferences') IS NOT NULL THEN
              ALTER TABLE public.ai_context_preferences
                ALTER COLUMN uid TYPE BIGINT USING uid::BIGINT;
            END IF;
          END;
          $migration$;
        `)
        .then(() => undefined)
        .catch((error: unknown) => {
          this.legacySchemaMigration = null;
          throw error;
        });
    }
    await this.legacySchemaMigration;
  }

  execute(statement: string | DatabaseStatement): Promise<DatabaseResult> {
    return this.ensureLegacySchemaMigration().then(() =>
      executeOn(getPool(), statement),
    );
  }

  async batch(
    statements: DatabaseStatement[],
    _mode?: "write" | "read",
  ): Promise<DatabaseResult[]> {
    await this.ensureLegacySchemaMigration();
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const results: DatabaseResult[] = [];
      for (const statement of statements) {
        results.push(await executeOn(client, statement));
      }
      await client.query("COMMIT");
      return results;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

const database = new PostgresDatabase();

export function getDatabase(): PostgresDatabase {
  return database;
}
