import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = await getDb();
  const result = await db.execute('SELECT id, username FROM users ORDER BY username ASC');
  return NextResponse.json(result.rows);
}
