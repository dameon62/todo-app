import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId, unauthorized } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();

  const { key } = await params;
  const db = await getDb();
  const result = await db.execute({
    sql: 'SELECT value FROM settings WHERE user_id = ? AND key = ? AND is_active = 1',
    args: [userId, key],
  });
  return NextResponse.json({ value: (result.rows[0]?.value as string) ?? null });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();

  const { key } = await params;
  const { value } = await req.json();
  const db = await getDb();
  // ON CONFLICT also resets is_active in case the setting was previously soft-deleted
  await db.execute({
    sql: `INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?)
          ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, is_active = 1`,
    args: [userId, key, value],
  });
  return NextResponse.json({ ok: true });
}
