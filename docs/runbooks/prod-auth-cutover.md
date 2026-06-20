# Runbook — production auth cutover

How to ship the account model (issues #3–#9) to production without orphaning the
group's existing live hunt. Read alongside ADR 0001.

## Why a runbook
The login wall (#3) and membership-gated hub (#5/#6) mean that, once deployed,
sessions with no `created_by`, no members, and `session_users` with no
`account_id` won't appear in anyone's hub. The existing live hunt is exactly
such a session. The accounts to claim it for don't exist until people sign in —
so part of this is necessarily done *after* the first deploy.

## Order of operations

1. **Push all held migrations to prod** (they're additive and inert until the
   code uses them):
   ```bash
   supabase db push
   ```
   This lands profiles, session names/owner, session_members, session_users
   .account_id, and invite_token on prod.

2. **Confirm the prod Supabase dashboard**: Authentication → Providers → Google
   enabled with the prod Client ID/Secret; URL Configuration Site URL +
   `https://commonground-gamma.vercel.app/**` redirect.

3. **Deploy the code** (push `main`). The app now requires login.

4. **Everyone signs in once** with Google. This creates their `auth.users` +
   `profiles` rows. Collect each person's account id:
   ```sql
   select id, email, display_name from profiles order by created_at;
   ```

5. **Find the live session and its participants**:
   ```sql
   select id, name from sessions order by created_at;             -- the hunt id
   select id, name from session_users where session_id = '<hunt>'; -- participants
   ```

6. **Claim it** with the backfill (service role; idempotent):
   ```bash
   SUPABASE_SERVICE_ROLE_KEY=<prod service role> \
   NEXT_PUBLIC_SUPABASE_URL=<prod url> \
   npx tsx src/scripts/claim-session.ts \
     --session <hunt_id> \
     --owner   <your_account_id> \
     --name    "The Ghent six" \
     --map <session_user_id>=<account_id> \
     --map <session_user_id>=<account_id> ...
   ```
   One `--map` per existing participant → the account that person signed in as.

7. **Verify**: each person reloads `/` and sees the hunt in their hub, already
   recognized inside it, with their reactions/uploads intact.

## Notes
- The script only sets ownership/membership/account links; it never deletes.
- Participants you don't map keep `account_id = null` (unclaimed) and can still
  be linked later by re-running with more `--map` pairs.
- After #9 (RLS), the service role is required for this backfill — the anon key
  won't have the rights.
