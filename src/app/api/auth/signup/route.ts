import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  if (!username?.trim() || !password?.trim()) {
    return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
  }
  const db = await getDb();

  const countRes = await db.execute('SELECT COUNT(*) as c FROM users');
  if (Number((countRes.rows[0] as any).c) >= 3) {
    return NextResponse.json({ error: 'User limit reached' }, { status: 403 });
  }

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

  // Seed default theme for new user
  await db.execute({
    sql: `INSERT OR IGNORE INTO settings (user_id, key, value) VALUES (?, 'theme', 'dark')`,
    args: [userId],
  });

  return NextResponse.json({ id: userId, username: username.trim() });
}
