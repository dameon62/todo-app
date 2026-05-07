import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  if (!username?.trim() || !password?.trim()) {
    return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
  }
  const db = await getDb();
  const u = username.trim();
  const p = password.trim();

  // Friendly pre-check; UNIQUE constraint also enforces atomically
  const exists = await db.execute({
    sql: 'SELECT id FROM users WHERE username = ?',
    args: [u],
  });
  if (exists.rows[0]) {
    return NextResponse.json({ error: 'Username taken' }, { status: 409 });
  }

  // Atomic insert-with-cap: a single statement, so two concurrent signups
  // cannot both pass the COUNT check.
  let inserted;
  try {
    inserted = await db.execute({
      sql: `INSERT INTO users (username, password)
            SELECT ?, ?
            WHERE (SELECT COUNT(*) FROM users WHERE is_active = 1) < 3`,
      args: [u, p],
    });
  } catch (e: any) {
    if (String(e?.message ?? '').toLowerCase().includes('unique')) {
      return NextResponse.json({ error: 'Username taken' }, { status: 409 });
    }
    throw e;
  }
  if (Number(inserted.rowsAffected) === 0) {
    return NextResponse.json({ error: 'User limit reached' }, { status: 403 });
  }
  const userId = Number(inserted.lastInsertRowid);

  // Seed default theme for new user
  await db.execute({
    sql: `INSERT OR IGNORE INTO settings (user_id, key, value) VALUES (?, 'theme', 'dark')`,
    args: [userId],
  });

  return NextResponse.json({ id: userId, username: u });
}
