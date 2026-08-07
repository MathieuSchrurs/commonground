import { NextRequest } from 'next/server';
import { route } from '@/lib/session/route';
import { addMeetingItem, listMeetingItems } from '@/lib/session/store';

type Ctx = { params: Promise<{ id: string }> };

// The agenda for the group's next meeting.
export const GET = route(async (_r: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  return { items: await listMeetingItems(id) };
});

// Add an agenda line.
export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const { text, createdBy } = await request.json();
  return { item: await addMeetingItem(id, text, createdBy ?? null) };
});
