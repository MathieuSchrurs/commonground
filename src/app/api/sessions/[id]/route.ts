import { route } from '@/lib/session/route';
import { requireAccountId } from '@/lib/auth';
import { getSession, listUsers, renameSession } from '@/lib/session/store';

type Ctx = { params: Promise<{ id: string }> };

// A session with its participants. 404 if the session doesn't exist.
export const GET = route(async (_req, { params }: Ctx) => {
  const { id } = await params;
  const session = await getSession(id);
  const users = await listUsers(id);
  return { session, users };
});

// Rename a session (must be a member).
export const PATCH = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  const accountId = await requireAccountId();
  const { name } = (await req.json()) as { name?: string };
  const session = await renameSession(id, accountId, name ?? '');
  return { session };
});
