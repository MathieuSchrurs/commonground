import { route } from '@/lib/session/route';
import { requireAccountId } from '@/lib/auth';
import { getInviteToken } from '@/lib/session/store';

type Ctx = { params: Promise<{ id: string }> };

// The invite token for this session, for a member to build a shareable link.
export const GET = route(async (_req, { params }: Ctx) => {
  const { id } = await params;
  const accountId = await requireAccountId();
  const token = await getInviteToken(id, accountId);
  return { token };
});
