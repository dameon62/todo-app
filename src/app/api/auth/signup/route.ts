import { NextRequest, NextResponse } from 'next/server';
import { getDb, DEFAULT_TAGS } from '@/lib/db';

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  if (!username?.trim() || !password?.trim()) {
    return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
  }
  const db = await getDb();

  const exists = await db.execute({
    sql: 'SELECT id FROM users WHERE username = ?',
    args: [username.trim()],
  });
  if (exists.rows[0]) {
    return NextResponse.json({ error: 'Username taken' }, { status: 409 });
  }

  const inserted = await db.execute({
    sql: 'INSERT INTO users (username, password) VALUES (?, ?)',
    args: [username.trim(), password.trim()],
  });
  const userId = Number(inserted.lastInsertRowid);

  // Seed default tags and theme for new user
  await db.batch([
    ...DEFAULT_TAGS.map(name => ({
      sql: 'INSERT OR IGNORE INTO tags (user_id, name) VALUES (?, ?)',
      args: [userId, name],
    })),
    {
      sql: `INSERT OR IGNORE INTO settings (user_id, key, value) VALUES (?, 'theme', 'dark')`,
      args: [userId],
    },
  ]);

  return NextResponse.json({ id: userId, username: username.trim() });
}
