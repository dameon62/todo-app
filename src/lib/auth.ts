import { NextRequest, NextResponse } from 'next/server';

export function getUserId(req: NextRequest): number | null {
  const v = req.headers.get('x-user-id');
  const n = Number(v);
  return v && !isNaN(n) && n > 0 ? n : null;
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
