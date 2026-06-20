import { route } from '@/lib/session/route';
import { listReactions, toggleReaction } from '@/lib/session/store';

type Ctx = { params: Promise<{ id: string }> };

// All reactions for a session.
export const GET = route(async (_req, { params }: Ctx) => {
  const { id: sessionId } = await params;
  return { reactions: await listReactions(sessionId) };
});

// Toggle a reaction: same reaction again removes it, a different one replaces it.
export const POST = route(async (req, { params }: Ctx) => {
  const { id: sessionId } = await params;
  const { listingId, userId, reaction } = await req.json();
  return { reaction: await toggleReaction(sessionId, listingId, userId, reaction) };
});
