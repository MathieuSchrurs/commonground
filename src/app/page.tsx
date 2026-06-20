import AccountBar from '@/components/AccountBar';
import HomeClient from '@/components/HomeClient';

// The home page is gated by the proxy, so anyone here is signed in. Show who,
// then the create / join UI. (Becomes the session hub in issue #5.)
export default function Page() {
  return (
    <>
      <AccountBar />
      <HomeClient />
    </>
  );
}
