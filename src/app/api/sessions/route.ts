import { route } from '@/lib/session/route';
import { requireAccountId } from '@/lib/auth';
import { createSession } from '@/lib/session/store';

// Create a new named session owned by the signed-in account (added as its first
// member). Returns the new session id.
export const POST = route(async (req) => {
  const accountId = await requireAccountId();
  const { name } = (await req.json().catch(() => ({}))) as { name?: string };
  const session = await createSession(accountId, name ?? '');
  return { sessionId: session.id };
});
