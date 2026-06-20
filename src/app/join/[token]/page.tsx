import { redirect } from 'next/navigation';
import { getAccountId } from '@/lib/auth';
import { joinSession } from '@/lib/session/store';

// Opening an invite link joins the signed-in account to the hunt and drops them
// into it. The proxy gates /join, so a logged-out visitor is sent to /login with
// ?next pointing back here; the guard below is belt-and-suspenders.
export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const accountId = await getAccountId();
  if (!accountId) redirect(`/login?next=${encodeURIComponent(`/join/${token}`)}`);

  let sessionId: string | null = null;
  try {
    const session = await joinSession(token, accountId);
    sessionId = session.id;
  } catch {
    sessionId = null;
  }

  if (!sessionId) redirect('/?invite=invalid');
  redirect(`/session/${sessionId}`);
}
