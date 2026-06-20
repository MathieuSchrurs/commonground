/**
 * Claim a pre-auth session for real accounts — the one-off backfill for the
 * production auth cutover (issue #8). Sessions and session_users created before
 * accounts existed have no owner, name, members, or account_id. This wires them
 * so the existing live hunt isn't orphaned once login ships.
 *
 * Usage:
 *   npx tsx src/scripts/claim-session.ts \
 *     --session <session_id> \
 *     --owner   <owner_account_id> \
 *     --name    "The Ghent six" \
 *     --map <session_user_id>=<account_id> --map <session_user_id>=<account_id>
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * The service role bypasses RLS so the backfill can write ownership/membership.
 * Idempotent: safe to re-run.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
function multi(name: string): string[] {
  const out: string[] = [];
  process.argv.forEach((a, i) => {
    if (a === `--${name}`) out.push(process.argv[i + 1]);
  });
  return out;
}

async function main() {
  const sessionId = arg('session');
  const owner = arg('owner');
  const name = arg('name');
  const maps = multi('map'); // ["session_user_id=account_id", ...]

  if (!sessionId || !owner) {
    console.error(
      'Required: --session <id> --owner <account_id>  [--name "..."] [--map suId=acctId ...]',
    );
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }
  const db = createClient(url, key);

  const userMap = new Map<string, string>();
  for (const m of maps) {
    const [su, acct] = m.split('=');
    if (su && acct) userMap.set(su.trim(), acct.trim());
  }

  // 1. The session gets an owner (and optionally a name).
  const sessionUpdate: Record<string, unknown> = { created_by: owner };
  if (name) sessionUpdate.name = name;
  const { error: sErr } = await db.from('sessions').update(sessionUpdate).eq('id', sessionId);
  if (sErr) throw sErr;
  console.log(`session ${sessionId}: created_by=${owner}${name ? `, name="${name}"` : ''}`);

  // 2. Membership: the owner, plus every mapped account.
  const memberRows = [{ session_id: sessionId, account_id: owner, role: 'owner' }];
  for (const acct of new Set(userMap.values())) {
    if (acct !== owner) memberRows.push({ session_id: sessionId, account_id: acct, role: 'member' });
  }
  const { error: mErr } = await db
    .from('session_members')
    .upsert(memberRows, { onConflict: 'session_id,account_id', ignoreDuplicates: true });
  if (mErr) throw mErr;
  console.log(`members: ${memberRows.length} (1 owner + ${memberRows.length - 1} member)`);

  // 3. Link each existing participant to its account.
  for (const [su, acct] of userMap) {
    const { error: uErr } = await db
      .from('session_users')
      .update({ account_id: acct })
      .eq('id', su)
      .eq('session_id', sessionId);
    if (uErr) throw uErr;
    console.log(`session_user ${su} -> account ${acct}`);
  }

  console.log('\nClaim complete.');
}

main().catch((e) => {
  console.error('Claim failed:', e);
  process.exit(1);
});
