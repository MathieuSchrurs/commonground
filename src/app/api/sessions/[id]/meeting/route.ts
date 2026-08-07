import { NextRequest } from 'next/server';
import { route } from '@/lib/session/route';
import { getMeeting, setMeeting } from '@/lib/session/store';

type Ctx = { params: Promise<{ id: string }> };

// The single pinned meeting, or null if none is set yet.
export const GET = route(async (_r: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  return { meeting: await getMeeting(id) };
});

// Create or replace it — there is only ever one, deliberately (ADR 0003).
export const PUT = route(async (request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const { meetsAt, location, note, updatedBy } = await request.json();
  return { meeting: await setMeeting(id, { meetsAt, location, note, updatedBy }) };
});
