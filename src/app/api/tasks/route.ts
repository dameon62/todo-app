import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId, unauthorized } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();

  const { id, col_key, text, tag, due, priority = 'med' } = await req.json();
  const db = await getDb();
  await db.execute({
    sql: 'INSERT INTO tasks (id, user_id, col_key, text, tag, due, priority) VALUES (?, ?, ?, ?, ?, ?, ?)',
    args: [id, userId, col_key, text, tag ?? null, due ?? null, priority],
  });
  return NextResponse.json({ ok: true });
}
