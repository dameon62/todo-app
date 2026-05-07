import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  const db = await getDb();
  const result = await db.execute({
    sql: 'SELECT id, username FROM users WHERE username = ? AND password = ?',
    args: [username, password],
  });
  if (!result.rows[0]) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  return NextResponse.json({ id: Number(result.rows[0].id), username: result.rows[0].username });
}
