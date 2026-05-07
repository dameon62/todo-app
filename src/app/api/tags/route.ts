import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId, unauthorized } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();

  const db = await getDb();
  const result = await db.execute({
    sql: 'SELECT name FROM tags WHERE user_id = ? AND is_active = 1 ORDER BY rowid ASC',
    args: [userId],
  });
  return NextResponse.json(result.rows.map(r => r.name));
}

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();

  const { name } = await req.json();
  const db = await getDb();
  // ON CONFLICT re-activates a previously soft-deleted tag with the same name
  await db.execute({
    sql: `INSERT INTO tags (user_id, name) VALUES (?, ?)
          ON CONFLICT(user_id, name) DO UPDATE SET is_active = 1`,
    args: [userId, name],
  });
  return NextResponse.json({ ok: true });
}
