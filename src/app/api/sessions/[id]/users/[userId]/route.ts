import { route } from '@/lib/session/route';
import { removeUser, updateUser } from '@/lib/session/store';
import { broadcastIsochroneUpdate } from '@/lib/session/isochroneBroadcast';

type Ctx = { params: Promise<{ id: string; userId: string }> };

// Replace a participant's commute constraint.
export const PUT = route(async (req, { params }: Ctx) => {
  const { id: sessionId, userId } = await params;
  const input = await req.json();
  const updated = await updateUser(sessionId, userId, input);
  // The constraint update already succeeded and is durable; a broadcast
  // failure (including getIsochrone rejecting) must not turn this into an
  // error response.
  try {
    await broadcastIsochroneUpdate(sessionId, updated);
  } catch {
    // best-effort; swallow
  }
  return updated;
});

// Remove a participant from the session.
export const DELETE = route(async (_req, { params }: Ctx) => {
  const { id: sessionId, userId } = await params;
  await removeUser(sessionId, userId);
  return { success: true };
});
