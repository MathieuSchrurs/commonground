# Runbook — production households cutover

How to ship the household model (issues #12–#18) to production. Read alongside
ADR 0002 and ADR 0003.

## State as verified (2026-08-07)

Checked read-only against the linked project, not assumed:

| | |
|---|---|
| Prod migration ledger | matches local exactly through `20260620190000` |
| Pending on both | the same 7 migrations, confirmed by `db push --dry-run` |
| Prod schema | has **none** of `search_buffer_pct`, `session_todos`, `meeting_items`, `households`, `session_decisions`, `close_meeting` |
| Prod reaction constraint | still `CHECK (reaction IN ('love','veto'))` |
| Prod data | 1 session · 6 participants · 4 members · 3 reactions · 14,419 listings · 3 files · 1 meeting |
| Prod reactions by value | **love 3, veto 0, object 0** |

Two consequences fall straight out of that:

- **The `veto` → `object` rename rewrites zero rows.** Nobody has ever used the
  negative reaction. The `UPDATE` is a no-op; only the constraint actually
  changes.
- **Production is already running code that is ahead of its database.** `main`
  ships the search buffer (`4e1ad1a`) and the agenda/todos dashboard (`d4591a2`),
  but none of those tables or columns exist in prod. Those parts of the
  dashboard are broken in production *right now*. Migrating fixes them.

> An earlier note in this project's history claimed `supabase db push` would
> fail partway on `ALTER PUBLICATION`. That is **wrong for production** — it is
> a local-only artefact, because this machine had `20260807`/`20260808` applied
> by hand without ledger rows. Prod's ledger and schema agree with each other.

## Ordering constraint

**Migrations must land before the code deploy.** The new dashboard reads
`households`, `session_decisions` and the `close_meeting` function; deploy first
and `/api/sessions/[id]/convergence` and `/decisions` return 500 until the
migrations catch up.

The reverse window — migrations applied, old code still serving — costs only
this: the old bundle posts `'veto'`, which the new constraint rejects, so
clicking ✕ does nothing until the deploy lands. With zero `veto` rows in the
entire history of the app, this is theoretical. Deploy promptly and it closes.

## Order of operations

1. **Take a keepable backup**, somewhere that is not a temp directory:

   ```bash
   supabase db dump --linked -f ~/commonground-backup-schema.sql
   supabase db dump --linked --data-only -f ~/commonground-backup-data.sql
   ```

   The data dump contains real emails and password hashes — keep it local,
   delete it once the cutover is confirmed good.

2. **Rehearse the whole chain locally.** This both proves the 22 migrations
   replay cleanly from zero and repairs this machine's ledger gap:

   ```bash
   supabase db reset
   ```

   Local data is disposable; this wipes it. Afterwards
   `supabase migration list` should show no local-only rows.

3. **Green light:** `npm test`, `npx tsc --noEmit`, `npx next build`.

4. **Push the 7 migrations:**

   ```bash
   supabase db push --linked --dry-run   # confirm the list is exactly the 7
   supabase db push --linked
   ```

5. **Deploy the code immediately after** — merge `dashboard-households` to
   `main` and let Vercel promote it. This is the window described above; keep it
   short rather than careful.

6. **Verify in production**, in this order (each depends on the previous):
   - a listing's ✕ button registers an objection (the constraint swap worked)
   - the dashboard's two cards render and no house appears in both
   - the agenda and todos cards load at all (these were broken before)
   - pair two participants in the map sidebar → the dashboard's `N of M`
     badges drop by one denominator
   - record a decision, then supersede it
   - close the meeting → agenda empties, decision and todo appear

## If it goes wrong

The migrations are additive apart from the constraint swap, so the fastest
recovery is usually forward, not back. Specific reversals:

- **Constraint swap:** re-widen with
  `ALTER TABLE listing_reactions DROP CONSTRAINT listing_reactions_reaction_check;`
  then re-add with both values. Zero rows to unwind.
- **New tables:** `DROP TABLE session_decisions, households CASCADE;` —
  `household_id` on `session_users` is `ON DELETE SET NULL`, so participants
  survive.
- **Whole-database restore:** the dumps from step 1, or Supabase's own PITR if
  the project is on a plan that includes it. Check before starting rather than
  during.

## Known-open follow-up

`session_todos` and `meeting_items` still carry `USING (true)` RLS from before
ADR 0001 tightened the other session-scoped tables — anyone holding a session id
can read and write them. They are listed in the ratchet test
(`src/lib/rls-ratchet.test.ts`) so the list cannot grow, but closing them is
outstanding work, not covered by this cutover.

Note also that prod has 6 `session_users` but only 4 `session_members`. Two
participants have no account behind them; they can be paired *by* a member, but
cannot sign in and act for themselves.
