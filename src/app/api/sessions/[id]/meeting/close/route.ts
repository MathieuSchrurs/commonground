import { NextRequest } from 'next/server';
import { route } from '@/lib/session/route';
import { closeMeeting } from '@/lib/session/store';

type Ctx = { params: Promise<{ id: string }> };

// Record the meeting's outcomes and clear its agenda, atomically.
export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const { decisions, todos, by } = await request.json();
  await closeMeeting(id, decisions ?? [], todos ?? [], by ?? null);
  return { ok: true };
});
