import { route } from '@/lib/session/route';
import { requireAccountId } from '@/lib/auth';
import { addUser } from '@/lib/session/store';

type Ctx = { params: Promise<{ id: string }> };

// Add the signed-in account's commute constraint to the session.
export const POST = route(async (req, { params }: Ctx) => {
  const { id: sessionId } = await params;
  const accountId = await requireAccountId();
  const input = await req.json();
  return addUser(sessionId, accountId, input);
});
