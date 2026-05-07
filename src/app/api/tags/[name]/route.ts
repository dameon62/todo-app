import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId, unauthorized } from '@/lib/auth';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();

  const { name } = await params;
  const { newName } = await req.json();
  const db = await getDb();
  await db.batch([
    { sql: 'UPDATE tags  SET name = ? WHERE user_id = ? AND name = ? AND is_active = 1', args: [newName, userId, name] },
    { sql: 'UPDATE tasks SET tag  = ? WHERE user_id = ? AND tag  = ? AND is_active = 1', args: [newName, userId, name] },
  ]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();

  const { name } = await params;
  const db = await getDb();
  // Soft-delete the tag; clear it from active tasks (tasks themselves stay)
  await db.batch([
    { sql: 'UPDATE tags  SET is_active = 0 WHERE user_id = ? AND name = ?',               args: [userId, name] },
    { sql: 'UPDATE tasks SET tag = NULL  WHERE user_id = ? AND tag = ? AND is_active = 1', args: [userId, name] },
  ]);
  return NextResponse.json({ ok: true });
}
