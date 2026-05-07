import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId, unauthorized } from '@/lib/auth';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();

  const { name } = await params;
  const { newName } = await req.json();
  const trimmed = typeof newName === 'string' ? newName.trim() : '';
  if (!trimmed || trimmed.length > 32) {
    return NextResponse.json({ error: 'Invalid tag name' }, { status: 400 });
  }
  if (trimmed === name) {
    return NextResponse.json({ ok: true });
  }
  const db = await getDb();
  // Pre-check for friendlier error; PRIMARY KEY also enforces atomically
  const exists = await db.execute({
    sql: 'SELECT 1 FROM tags WHERE user_id = ? AND name = ? AND is_active = 1',
    args: [userId, trimmed],
  });
  if (exists.rows[0]) {
    return NextResponse.json({ error: 'Tag already exists' }, { status: 409 });
  }
  try {
    await db.batch([
      { sql: 'UPDATE tags  SET name = ? WHERE user_id = ? AND name = ? AND is_active = 1', args: [trimmed, userId, name] },
      { sql: 'UPDATE tasks SET tag  = ? WHERE user_id = ? AND tag  = ? AND is_active = 1', args: [trimmed, userId, name] },
    ]);
  } catch (e: any) {
    if (String(e?.message ?? '').toLowerCase().includes('unique')) {
      return NextResponse.json({ error: 'Tag already exists' }, { status: 409 });
    }
    throw e;
  }
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
