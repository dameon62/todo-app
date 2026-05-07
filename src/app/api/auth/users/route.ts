import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = await getDb();
  const result = await db.execute(
    'SELECT id, username FROM users WHERE is_active = 1 ORDER BY username ASC'
  );
  return NextResponse.json(result.rows);
}
