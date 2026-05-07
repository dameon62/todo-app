import { createClient } from '@libsql/client';

const db = createClient({
  url:       process.env.TURSO_DATABASE_URL ?? 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

let ready = false;

export async function getDb() {
  if (ready) return db;

  // Detect v1 schema (no users table) and migrate by dropping old tables
  const hasUsers = await db.execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='users'`
  );
  if (hasUsers.rows.length === 0) {
    await db.executeMultiple(`
      DROP TABLE IF EXISTS settings;
      DROP TABLE IF EXISTS tags;
      DROP TABLE IF EXISTS tasks;
    `);
  }

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id       INTEGER PRIMARY KEY,
      username TEXT    UNIQUE NOT NULL,
      password TEXT    NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id           TEXT    PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id),
      col_key      TEXT,
      text         TEXT    NOT NULL,
      due          TEXT,
      tag          TEXT,
      done         INTEGER NOT NULL DEFAULT 0,
      priority     TEXT    NOT NULL DEFAULT 'med',
      completed_at INTEGER,
      is_archived  INTEGER NOT NULL DEFAULT 0,
      origin_hue   TEXT,
      created_at   INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE TABLE IF NOT EXISTS tags (
      user_id  INTEGER NOT NULL REFERENCES users(id),
      name     TEXT    NOT NULL,
      PRIMARY KEY (user_id, name)
    );
    CREATE TABLE IF NOT EXISTS settings (
      user_id  INTEGER NOT NULL REFERENCES users(id),
      key      TEXT    NOT NULL,
      value    TEXT    NOT NULL,
      PRIMARY KEY (user_id, key)
    );
  `);

  ready = true;
  return db;
}

export function rowToTask(row: Record<string, unknown>) {
  return {
    id:          row.id          as string,
    text:        row.text        as string,
    due:         (row.due         as string | null) ?? null,
    tag:         (row.tag         as string | null) ?? null,
    done:        row.done        === 1,
    priority:    row.priority    as string,
    completedAt: (row.completed_at as number | null) ?? null,
    _origin:     (row.origin_hue  as string | null) ?? null,
  };
}

export async function sweepArchive(userId: number) {
  const db = await getDb();
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  await db.execute({
    sql: `
      UPDATE tasks
      SET is_archived = 1,
          origin_hue  = CASE col_key
                          WHEN 'short'  THEN 'green'
                          WHEN 'medium' THEN 'yellow'
                          ELSE               'blue'
                        END
      WHERE done = 1 AND completed_at IS NOT NULL
        AND completed_at < ? AND is_archived = 0 AND user_id = ?
    `,
    args: [cutoff, userId],
  });
}

export const DEFAULT_TAGS = ['Work', 'Admin', 'Home', 'Health', 'Product', 'Hiring', 'Team', 'Personal'];
