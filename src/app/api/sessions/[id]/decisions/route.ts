import { NextRequest } from 'next/server';
import { route } from '@/lib/session/route';
import { listDecisions, recordDecision } from '@/lib/session/store';

type Ctx = { params: Promise<{ id: string }> };

// What the group has agreed. No completion state — a decision is superseded,
// never finished.
export const GET = route(async (_request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  return { decisions: await listDecisions(id) };
});

// Record an agreement, optionally replacing an earlier one.
export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const { text, decidedBy, supersedesId } = await request.json();
  return { decision: await recordDecision(id, text, decidedBy ?? null, supersedesId ?? null) };
});
