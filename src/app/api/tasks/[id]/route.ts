import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId, unauthorized } from '@/lib/auth';

const ALLOWED: Record<string, boolean> = {
  text: true, due: true, tag: true, done: true,
  priority: true, completed_at: true, is_archived: true, origin_hue: true,
  // is_active is intentionally excluded — managed only by account/tag delete endpoints
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();

  const { id } = await params;
  const patch = await req.json();
  const cols = Object.keys(patch).filter(k => ALLOWED[k]);
  if (!cols.length) return NextResponse.json({ ok: true });

  const args = cols.map(k => {
    const v = patch[k];
    return (k === 'done' || k === 'is_archived') ? (v ? 1 : 0) : (v ?? null);
  });
  args.push(userId, id);

  const db = await getDb();
  await db.execute({
    sql: `UPDATE tasks SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE user_id = ? AND id = ? AND is_active = 1`,
    args,
  });
  return NextResponse.json({ ok: true });
}
