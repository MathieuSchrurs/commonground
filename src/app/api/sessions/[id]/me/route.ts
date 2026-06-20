import { route } from '@/lib/session/route';
import { getAccountId } from '@/lib/auth';
import { getMyParticipant } from '@/lib/session/store';

type Ctx = { params: Promise<{ id: string }> };

// The signed-in account's own participant in this session (or null if they
// haven't added their commute constraint yet). This is "who am I".
export const GET = route(async (_req, { params }: Ctx) => {
  const { id } = await params;
  const accountId = await getAccountId();
  if (!accountId) return { participant: null };
  const participant = await getMyParticipant(id, accountId);
  return { participant };
});
