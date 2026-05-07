import { createClient } from '@libsql/client';

const db = createClient({
  url:       process.env.TURSO_DATABASE_URL ?? 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

let ready = false;

// Add a column only if it doesn't already exist — uses PRAGMA to avoid
// silent failures from try/catch swallowing real errors.
async function addColumnIfMissing(table: string, column: string, def: string) {
  const info = await db.execute(`PRAGMA table_info(${table})`);
  const exists = info.rows.some((r: any) => r.name === column);
  if (!exists) {
    // DROP NOT NULL from ALTER TABLE — SQLite doesn't enforce it for ADD COLUMN
    // on existing rows. The constraint is retained in CREATE TABLE for fresh DBs.
    const safeDef = def.replace('NOT NULL', '').replace(/\s+/g, ' ').trim();
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${safeDef}`);
  }
}

const TS_DEF  = `TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))`;
const ACT_DEF = `INTEGER NOT NULL DEFAULT 1`;

export async function getDb() {
  if (ready) return db;

  // Detect v1 schema (no users table) → drop old tables so CREATE TABLE runs fresh
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
      id         INTEGER PRIMARY KEY,
      username   TEXT    UNIQUE NOT NULL,
      password   TEXT    NOT NULL,
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_on TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
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
      is_active    INTEGER NOT NULL DEFAULT 1,
      origin_hue   TEXT,
      created_at   INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      created_on   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE TABLE IF NOT EXISTS tags (
      user_id    INTEGER NOT NULL REFERENCES users(id),
      name       TEXT    NOT NULL,
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_on TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      PRIMARY KEY (user_id, name)
    );
    CREATE TABLE IF NOT EXISTS settings (
      user_id    INTEGER NOT NULL REFERENCES users(id),
      key        TEXT    NOT NULL,
      value      TEXT    NOT NULL,
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_on TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      PRIMARY KEY (user_id, key)
    );
  `);

  // Column migrations — MUST run before indexes that reference these columns
  await addColumnIfMissing('users',    'created_on', TS_DEF);
  await addColumnIfMissing('tasks',    'created_on', TS_DEF);
  await addColumnIfMissing('tags',     'created_on', TS_DEF);
  await addColumnIfMissing('settings', 'created_on', TS_DEF);
  await addColumnIfMissing('users',    'is_active',  ACT_DEF);
  await addColumnIfMissing('tasks',    'is_active',  ACT_DEF);
  await addColumnIfMissing('tags',     'is_active',  ACT_DEF);
  await addColumnIfMissing('settings', 'is_active',  ACT_DEF);

  // Indexes — created after column migrations so referenced columns are guaranteed present
  await db.executeMultiple(`
    CREATE INDEX IF NOT EXISTS idx_tasks_board
      ON tasks(user_id, is_active, is_archived, created_at);

    CREATE INDEX IF NOT EXISTS idx_tasks_archive
      ON tasks(user_id, is_active, is_archived, completed_at);

    CREATE INDEX IF NOT EXISTS idx_tasks_tag
      ON tasks(user_id, tag);

    CREATE INDEX IF NOT EXISTS idx_tags_user_active
      ON tags(user_id, is_active);

    CREATE INDEX IF NOT EXISTS idx_users_active
      ON users(is_active, username);
  `);

  // One-time data migrations
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
  `);
  const tagMigDone = await db.execute(
    `SELECT name FROM _migrations WHERE name = 'remove_default_tags'`
  );
  if (tagMigDone.rows.length === 0) {
    await db.execute(
      `DELETE FROM tags WHERE name IN ('Work','Admin','Home','Health','Product','Hiring','Team','Personal')`
    );
    await db.execute(`INSERT INTO _migrations (name) VALUES ('remove_default_tags')`);
  }

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
        AND completed_at < ? AND is_archived = 0 AND is_active = 1 AND user_id = ?
    `,
    args: [cutoff, userId],
  });
}
