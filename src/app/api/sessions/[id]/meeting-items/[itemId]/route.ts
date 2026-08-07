import { NextRequest } from 'next/server';
import { route } from '@/lib/session/route';
import { removeMeetingItem, setMeetingItemDone } from '@/lib/session/store';

type Ctx = { params: Promise<{ id: string; itemId: string }> };

// Tick an agenda line off as it is discussed.
export const PATCH = route(async (request: NextRequest, { params }: Ctx) => {
  const { id, itemId } = await params;
  const { done } = await request.json();
  return { item: await setMeetingItemDone(id, itemId, done) };
});

export const DELETE = route(async (_r: NextRequest, { params }: Ctx) => {
  const { id, itemId } = await params;
  await removeMeetingItem(id, itemId);
  return { ok: true };
});
