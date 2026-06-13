import { createClient } from '@libsql/client';

const db = createClient({
  url:       process.env.TURSO_DATABASE_URL ?? 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

let ready = false;
let initPromise: Promise<void> | null = null;

// Add a column to an existing table if it isn't already there.
// ALTER TABLE ADD COLUMN in Turso/libSQL has two restrictions vs CREATE TABLE:
//   1. NOT NULL requires a *constant* default — strip it (existing rows take the default)
//   2. Expression defaults like DEFAULT (strftime(...)) are non-constant → replace with NULL
async function addColumnIfMissing(table: string, column: string, def: string) {
  const safeDef = def
    .replace(/NOT NULL/gi, '')
    .replace(/DEFAULT\s*\(.*$/gi, 'DEFAULT NULL')
    .replace(/\s+/g, ' ')
    .trim();
  try {
    await db.execute(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${safeDef}`);
  } catch (e: any) {
    const msg = String(e?.message ?? e).toLowerCase();
    if (!msg.includes('duplicate column') && !msg.includes('already exists')) {
      throw e;
    }
  }
}

const ACT_DEF = `INTEGER NOT NULL DEFAULT 1`;

// Sentinel migration name — when present in `_migrations`, schema is current
// and `runInit` short-circuits after a single SELECT. This is the cold-start
// fast path: previously every cold container ran 8+ ALTER TABLE round-trips.
// Bump this string whenever the schema or migration block changes.
const SCHEMA_SENTINEL = 'schema_v3';

export async function getDb() {
  if (ready) return db;
  // Memoize so concurrent first-requests share a single migration run.
  if (!initPromise) {
    initPromise = runInit().catch((e) => {
      initPromise = null; // allow retry on next call if init failed
      throw e;
    });
  }
  await initPromise;
  return db;
}

async function runInit() {
  // Fast path — single round-trip when schema sentinel is already recorded.
  // Wrapped in try/catch because `_migrations` may not exist on a fresh DB.
  try {
    const r = await db.execute(
      `SELECT 1 FROM _migrations WHERE name = '${SCHEMA_SENTINEL}'`
    );
    if (r.rows.length > 0) {
      ready = true;
      return;
    }
  } catch {
    // _migrations table doesn't exist — fall through to full init
  }

  // ---- Full init path: runs once per DB lifetime (or after schema bump) ----

  // v1 detection: no `users` table → drop tasks/tags/settings so CREATE TABLE
  // below produces a fresh schema instead of inheriting v1 column types.
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

  // CHECK constraints below apply to *fresh* tables only — SQLite ALTER TABLE
  // can't add CHECK to an existing table without a full rebuild.
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id        INTEGER PRIMARY KEY,
      username  TEXT    UNIQUE NOT NULL,
      password  TEXT    NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1))
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id           TEXT    PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id),
      col_key      TEXT    CHECK (col_key IN ('short','medium','long')),
      text         TEXT    NOT NULL,
      due          TEXT,
      tag          TEXT,
      done         INTEGER NOT NULL DEFAULT 0   CHECK (done IN (0,1)),
      priority     TEXT    NOT NULL DEFAULT 'med' CHECK (priority IN ('high','med','low')),
      completed_at INTEGER,
      is_archived  INTEGER NOT NULL DEFAULT 0   CHECK (is_archived IN (0,1)),
      is_active    INTEGER NOT NULL DEFAULT 1   CHECK (is_active IN (0,1)),
      cancelled    INTEGER NOT NULL DEFAULT 0   CHECK (cancelled IN (0,1)),
      created_at   INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE TABLE IF NOT EXISTS tags (
      user_id   INTEGER NOT NULL REFERENCES users(id),
      name      TEXT    NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
      PRIMARY KEY (user_id, name)
    );
    CREATE TABLE IF NOT EXISTS settings (
      user_id   INTEGER NOT NULL REFERENCES users(id),
      key       TEXT    NOT NULL,
      value     TEXT    NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
      PRIMARY KEY (user_id, key)
    );
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
  `);

  // Column migrations for existing v1.5 DBs that pre-date `is_active`.
  // Skipped on fresh DBs because the column is already in CREATE TABLE.
  await addColumnIfMissing('users',    'is_active', ACT_DEF);
  await addColumnIfMissing('tasks',    'is_active', ACT_DEF);
  await addColumnIfMissing('tags',     'is_active', ACT_DEF);
  await addColumnIfMissing('settings', 'is_active', ACT_DEF);
  await addColumnIfMissing('tasks',    'cancelled',  'INTEGER NOT NULL DEFAULT 0');

  // Drop the now-unused `origin_hue` column on existing DBs. The frontend
  // derives the archive hue from `col_key` instead. ALTER TABLE DROP COLUMN
  // requires SQLite 3.35+ (libSQL/Turso supports it).
  try {
    await db.execute(`ALTER TABLE tasks DROP COLUMN origin_hue`);
  } catch {
    // Column doesn't exist (fresh DB) — fine.
  }

  // Drop legacy indexes that included low-selectivity `is_active` and
  // recreate without it. After `user_id`, `is_archived` already has only
  // 2 distinct values so adding `is_active` to the key adds bytes without
  // narrowing further.
  await db.executeMultiple(`
    DROP INDEX IF EXISTS idx_tasks_board;
    DROP INDEX IF EXISTS idx_tasks_archive;
    DROP INDEX IF EXISTS idx_tags_user_active;
    DROP INDEX IF EXISTS idx_users_active;

    CREATE INDEX IF NOT EXISTS idx_tasks_board
      ON tasks(user_id, is_archived, created_at);

    CREATE INDEX IF NOT EXISTS idx_tasks_archive
      ON tasks(user_id, is_archived, completed_at);

    CREATE INDEX IF NOT EXISTS idx_tasks_tag
      ON tasks(user_id, tag);
  `);

  // One-time data migration: remove default tags seeded by older signups.
  const tagMigDone = await db.execute(
    `SELECT 1 FROM _migrations WHERE name = 'remove_default_tags'`
  );
  if (tagMigDone.rows.length === 0) {
    await db.execute(
      `DELETE FROM tags WHERE name IN ('Work','Admin','Home','Health','Product','Hiring','Team','Personal')`
    );
    await db.execute(`INSERT INTO _migrations (name) VALUES ('remove_default_tags')`);
  }

  await db.execute(`INSERT OR IGNORE INTO _migrations (name) VALUES ('${SCHEMA_SENTINEL}')`);
  ready = true;
}

export function rowToTask(row: Record<string, unknown>) {
  return {
    id:          row.id          as string,
    text:        row.text        as string,
    due:         (row.due         as string | null) ?? null,
    tag:         (row.tag         as string | null) ?? null,
    done:        row.done        === 1,
    cancelled:   row.cancelled   === 1,
    priority:    row.priority    as string,
    completedAt: (row.completed_at as number | null) ?? null,
    colKey:      (row.col_key     as string | null) ?? null,
  };
}

// Age after which a completed/cancelled task is swept into the archive.
// Defaults to 30 days. Override with the ARCHIVE_AGE_MS env var (e.g. 60000 =
// 1 minute) for local testing — set it in .env.local and restart the dev
// server. Read per-call so the knob takes effect without code changes.
// NOTE: the sweep is lazy + per-user — it only runs inside GET /api/board for
// the requesting user, so a task archives on the first board load *after* this
// age elapses (i.e. ">= age", not exactly at it), and an inactive user's tasks
// don't archive until they next open the app.
const DEFAULT_ARCHIVE_AGE_MS = 30 * 24 * 60 * 60 * 1000;
function archiveAgeMs() {
  const v = Number(process.env.ARCHIVE_AGE_MS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_ARCHIVE_AGE_MS;
}

export async function sweepArchive(userId: number) {
  const db = await getDb();
  const cutoff = Date.now() - archiveAgeMs();
  // Cheap predicate-check first: avoids a UPDATE round-trip on every board
  // load when there's nothing to archive (the common case).
  const probe = await db.execute({
    sql: `SELECT 1 FROM tasks
          WHERE user_id = ? AND is_active = 1 AND is_archived = 0
            AND (done = 1 OR cancelled = 1)
            AND completed_at IS NOT NULL AND completed_at < ?
          LIMIT 1`,
    args: [userId, cutoff],
  });
  if (probe.rows.length === 0) return;
  await db.execute({
    sql: `UPDATE tasks
          SET is_archived = 1
          WHERE user_id = ? AND is_active = 1 AND is_archived = 0
            AND (done = 1 OR cancelled = 1)
            AND completed_at IS NOT NULL AND completed_at < ?`,
    args: [userId, cutoff],
  });
}
