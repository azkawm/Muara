import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { migrate } from "drizzle-orm/sqlite-proxy/migrator";
import * as schema from "./schema.js";

export type Db = SqliteRemoteDatabase<typeof schema>;

/**
 * SQLite through Node's built-in `node:sqlite`, wrapped by Drizzle's proxy driver. No native
 * build step, so it installs the same on Windows and in the Docker image.
 */
export async function openDb(path: string): Promise<{ db: Db; close: () => void }> {
  if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });
  const sqlite = new DatabaseSync(path);
  sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");

  const db = drizzle(
    async (sql, params, method) => {
      const stmt = sqlite.prepare(sql);
      const args = params as SQLInputValue[];
      if (method === "run") {
        stmt.run(...args);
        return { rows: [] };
      }
      stmt.setReturnArrays(true);
      if (method === "get") return { rows: stmt.get(...args) as unknown as unknown[] };
      return { rows: stmt.all(...args) as unknown as unknown[] };
    },
    { schema },
  );

  await migrate(
    db,
    async (queries) => {
      for (const query of queries) sqlite.exec(query);
    },
    { migrationsFolder: migrationsFolder() },
  );

  return { db, close: () => sqlite.close() };
}

/** Works from both `src/db` (tsx) and the bundled `dist`. */
function migrationsFolder(): string {
  const here = import.meta.dirname;
  const candidates = [resolve(here, "../../drizzle"), resolve(here, "../drizzle")];
  const found = candidates.find((dir) => existsSync(resolve(dir, "meta/_journal.json")));
  if (!found) throw new Error(`Drizzle migrations not found near ${here}`);
  return found;
}
