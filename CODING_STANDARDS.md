# Coding standards

The rules a reviewer checks this repo against. `CLAUDE.md` orients you; this
file is the checklist. Where they disagree, `CONTEXT.md` and `docs/adr/` win.

Everything here is a **hard violation** unless marked *judgement*. Anything
eslint, tsc or CI already enforces is out of scope — don't restate tooling.

## 1. Domain language

`CONTEXT.md` defines every noun this codebase speaks in, and for each one lists
the synonyms that were deliberately rejected. A new identifier, type, column,
route segment or comment using a rejected synonym is a violation, not a
preference. The vocabulary is the design.

Most frequently violated:

| Use | Never |
|---|---|
| reaction, objection | vote, veto, downvote, like |
| account, participant | user, login |
| session | room, group, room-code |
| listing | property, house, ad, result |
| todo | task, chore, action item |
| household | couple, family, team |
| decision | agreement, rule, conclusion |

## 2. The session store is the only seam

`src/lib/session/store.ts` owns all session-scoped data access. In a route
handler under `src/app/api/sessions/`, these are violations:

- importing a Supabase client directly
- snake_case fields crossing into domain types — mapping belongs in
  `src/lib/session/mappers.ts`, and domain types never carry snake_case
- hand-rolled `NextResponse.json({ error }, { status })`
- business logic in the handler rather than the store

`src/app/api/sessions/[id]/todos/route.ts` is the reference shape: parse params,
call one or two store functions, return a plain object.

The non-session routes (`geocode`, `isochrone`, `intersection`, `scrape`) proxy
Mapbox and the scraper rather than session data, so the store rule does not
apply to them. The `route()` wrapper still should — error mapping belongs in one
place regardless of what the handler talks to.

## 3. Typed errors

The store throws `NotFound`, `Invalid`, `Unauthorized`
(`src/lib/session/errors.ts`); the `route()` wrapper maps them to 404 / 400 /
401. Returning status codes by hand, or catching these types outside `route()`,
is a violation.

## 4. Migrations and RLS

For any new file in `supabase/migrations/`:

- A table with a `session_id` **must** be membership-scoped. `USING (true)` or
  `WITH CHECK (true)` on such a table is the single most serious violation in
  this list — it has already shipped twice by copying a neighbouring table that
  predated the tightening.
- `KNOWN_OPEN` in `src/lib/rls-ratchet.test.ts` must stay empty. Adding an entry
  requires a written justification in that file, in the same diff.
- Check `docs/runbooks/` for a cutover covering the same tables before adding a
  migration that touches auth or households.

## 5. Load-bearing invariants

- **`updateSession` must return `supabaseResponse` unmodified**
  (`src/utils/supabase/proxy.ts`). Rebuilding it desyncs the browser and server
  sessions and logs people out at random.
- **`buildFolderTree` surfaces orphans and cycles at the root rather than
  throwing.** A blank hub is worse than an oddly-placed folder. Making it throw
  is a violation.
- **`MAX_FOLDER_DEPTH = 3`**, enforced as destination depth *plus subtree
  height* on a move — not just the destination's depth.
- **Access is by membership.** A session id in a URL is not a secret and is not
  access control. Invite tokens are the exception — `/join/<uuid>` is a bearer
  secret. Flag any diff that logs one, returns one in an error, or commits one
  in a fixture.
- **Production access is not a debugging tool.** `supabase db query --linked`
  and anything authenticated with `SUPABASE_SERVICE_ROLE_KEY` bypass RLS against
  the live database. A diff that adds either to a script, a test, or a
  development workflow is a violation.

## 6. Settled decisions

Reversing one of these without a new ADR is a violation:

- **ADR 0002** — an objection is an opening position, not a kill switch. A
  listing stays alive and visible while objections stand. Removing it from the
  hunt is a deliberate group act, never the side effect of one reaction.
- **ADR 0003** — one meeting, not a history. A decision is settled, can be
  superseded, and is never "completed". A decision is not a todo.

## 7. Tests

- New code under `src/app/` or `src/components/` arrives with a test. Those
  areas are thin today; new work brings its own coverage rather than matching
  the neighbours.
- Tests live beside the code as `src/**/*.test.ts`, run under vitest in the
  node environment, and test behaviour through public interfaces.
- **A test must fail without the change it defends.** `npm run test:teeth`
  proves this against the merge-base. A diff that adds tests with no evidence
  the check was run is a violation.
- Tautological tests — where the assertion recomputes the expected value the
  same way the code does — are a violation even when they pass. Expected values
  come from an independent source: a known-good literal, a worked example, the
  spec.
- **A test that asserts a status code without asserting the body pins half the
  behaviour.** `expect(res.status).toBe(404)` still passes when the message is
  wrong, leaks user input, or changes shape. `src/lib/session/route.test.ts` is
  the reference: status *and* body, every case.
- *Judgement*: prefer a ratchet over a one-off assertion where the same mistake
  is likely to recur. `rls-ratchet.test.ts` is the model.
