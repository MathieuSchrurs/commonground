import { route } from '@/lib/session/route';
import { removeUser, updateUser } from '@/lib/session/store';

type Ctx = { params: Promise<{ id: string; userId: string }> };

// Replace a participant's commute constraint.
export const PUT = route(async (req, { params }: Ctx) => {
  const { id: sessionId, userId } = await params;
  const input = await req.json();
  return updateUser(sessionId, userId, input);
});

// Remove a participant from the session.
export const DELETE = route(async (_req, { params }: Ctx) => {
  const { id: sessionId, userId } = await params;
  await removeUser(sessionId, userId);
  return { success: true };
});
