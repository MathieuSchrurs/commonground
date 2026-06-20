import { route } from '@/lib/session/route';
import { addUser } from '@/lib/session/store';

type Ctx = { params: Promise<{ id: string }> };

// Add a participant (commute constraint) to the session.
export const POST = route(async (req, { params }: Ctx) => {
  const { id: sessionId } = await params;
  const input = await req.json();
  return addUser(sessionId, input);
});
