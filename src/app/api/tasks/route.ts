import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId, unauthorized } from '@/lib/auth';

const COL_KEYS   = new Set(['short', 'medium', 'long']);
const PRIORITIES = new Set(['high', 'med', 'low']);
const ISO_DATE   = /^\d{4}-\d{2}-\d{2}$/;

const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400 });

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return bad('Invalid body');

  const { id, col_key, text, tag, due, priority = 'med' } = body as Record<string, unknown>;

  if (typeof id !== 'string' || !id || id.length > 64) return bad('Invalid id');
  if (typeof col_key !== 'string' || !COL_KEYS.has(col_key)) return bad('Invalid col_key');
  if (typeof text !== 'string' || !text.trim() || text.length > 150) return bad('Invalid text');
  if (typeof priority !== 'string' || !PRIORITIES.has(priority)) return bad('Invalid priority');
  if (tag != null && (typeof tag !== 'string' || tag.length > 32)) return bad('Invalid tag');
  if (due != null && (typeof due !== 'string' || !ISO_DATE.test(due))) return bad('Invalid due');

  const db = await getDb();
  await db.execute({
    sql: 'INSERT INTO tasks (id, user_id, col_key, text, tag, due, priority) VALUES (?, ?, ?, ?, ?, ?, ?)',
    args: [id, userId, col_key, text, (tag as string | null) ?? null, (due as string | null) ?? null, priority],
  });
  return NextResponse.json({ ok: true });
}
