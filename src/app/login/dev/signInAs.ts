import { getServiceRoleClient } from '@/lib/supabase';
import { createClient } from '@/utils/supabase/server';
import { isDevLoginEnabled } from './guard';

// Dev-only: mint a session for an existing account without a password. The
// service-role key generates a one-time magic-link token, and the cookie-bound
// client exchanges it, writing the auth cookies. Refuses to run unless the
// dev-login gates (NODE_ENV + ENABLE_DEV_LOGIN) are open, so even a stray
// caller can't mint sessions outside local development.
export async function signInAs(email: string): Promise<boolean> {
  if (!isDevLoginEnabled()) return false;

  const admin = getServiceRoleClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) return false;

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: tokenHash,
  });
  return !verifyError;
}
