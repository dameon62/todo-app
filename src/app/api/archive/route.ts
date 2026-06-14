import { NextRequest, NextResponse } from 'next/server';
import { getDb, rowToTask } from '@/lib/db';
import { getUserId, unauthorized } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();

  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT id, col_key, text, due, tag, done, cancelled, urgent, priority, completed_at
          FROM tasks
          WHERE is_archived = 1 AND is_active = 1 AND user_id = ?
          ORDER BY completed_at DESC`,
    args: [userId],
  });
  return NextResponse.json(result.rows.map(r => rowToTask(r as any)));
}
