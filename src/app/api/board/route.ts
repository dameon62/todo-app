import { NextRequest, NextResponse } from 'next/server';
import { getDb, rowToTask, sweepArchive } from '@/lib/db';
import { getUserId, unauthorized } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();

  await sweepArchive(userId);
  const db = await getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM tasks WHERE is_archived = 0 AND is_active = 1 AND user_id = ? ORDER BY created_at DESC',
    args: [userId],
  });
  const board: Record<string, ReturnType<typeof rowToTask>[]> = { short: [], medium: [], long: [] };
  for (const row of result.rows) {
    const key = row.col_key as string;
    if (board[key]) board[key].push(rowToTask(row as any));
  }
  return NextResponse.json(board);
}
