import { route } from '@/lib/session/route';
import { getSession, listUsers } from '@/lib/session/store';

type Ctx = { params: Promise<{ id: string }> };

// A session with its participants. 404 if the session doesn't exist.
export const GET = route(async (_req, { params }: Ctx) => {
  const { id } = await params;
  const session = await getSession(id);
  const users = await listUsers(id);
  return { session, users };
});
