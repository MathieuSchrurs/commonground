import { createClient } from '@/utils/supabase/server';
import { Unauthorized } from '@/lib/session/errors';

// The signed-in account's id (the JWT `sub` claim), or null if not signed in.
export async function getAccountId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return typeof sub === 'string' ? sub : null;
}

// Same, but throws Unauthorized (→ 401) when there is no signed-in account. Use
// in route handlers, which the proxy does not gate.
export async function requireAccountId(): Promise<string> {
  const id = await getAccountId();
  if (!id) throw new Unauthorized();
  return id;
}
