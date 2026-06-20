import AccountBar from '@/components/AccountBar';
import Hub from '@/components/Hub';
import { getAccountId } from '@/lib/auth';
import { listSessionsForAccount } from '@/lib/session/store';

// The session hub — gated by the proxy, so anyone here is signed in. Lists the
// account's hunts and lets them name a new one.
export default async function Page() {
  const accountId = await getAccountId();
  const sessions = accountId ? await listSessionsForAccount(accountId) : [];
  return (
    <>
      <AccountBar />
      <Hub sessions={sessions} />
    </>
  );
}
