import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId, unauthorized } from '@/lib/auth';

export async function DELETE(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();

  const db = await getDb();
  // Soft-delete: user and all their data — nothing is ever hard-deleted
  await db.batch([
    { sql: 'UPDATE tasks    SET is_active = 0 WHERE user_id = ?', args: [userId] },
    { sql: 'UPDATE tags     SET is_active = 0 WHERE user_id = ?', args: [userId] },
    { sql: 'UPDATE settings SET is_active = 0 WHERE user_id = ?', args: [userId] },
    { sql: 'UPDATE users    SET is_active = 0 WHERE id = ?',      args: [userId] },
  ]);
  return NextResponse.json({ ok: true });
}
