@AGENTS.md

# Working in this repo

## Read these before writing code

- **`CONTEXT.md`** — the domain glossary. It defines every noun this codebase
  speaks in and, for each, the words *not* to use. Naming a thing "vote", "veto",
  "user" or "room" is a bug here, not a style preference. Read it first.
- **`docs/adr/`** — three decisions that are settled and that new code must not
  quietly reverse:
  - `0001` accounts and Supabase Auth
  - `0002` households decide, and an objection does not kill a listing
  - `0003` one meeting (not a history), and a decision is not a todo
- **`docs/notes/supabase-ssr-next16.md`** — the cookie/session handling this app
  depends on.
- **`docs/runbooks/`** — production cutovers. Read the matching one before
  touching auth or households in a way that needs a migration.

## Commands

```
npm run dev         next dev
npm test            vitest run          (17 files, 125 tests, ~1s)
npm run typecheck   tsc --noEmit
npm run lint        eslint
npm run build       next build
npm run test:teeth  prove new tests fail at the merge-base
```

CI runs lint, typecheck and test on every PR. `next build` is not in CI —
Vercel builds every push and preview.

## Architecture

**The session store is the only seam over session-scoped data.**
`src/lib/session/store.ts` exposes domain verbs (`getSession`, `listTodos`,
`toggleReaction`, …), returns domain types, and owns two invariants: every query
is session-scoped, and failures are typed errors. Grow it one aggregate at a
time.

**API routes are thin shells.** A route parses params and the body, calls one or
two store functions, and returns a plain object. It does not touch Supabase, do
camel↔snake mapping, or build HTTP responses by hand. Compare
`src/app/api/sessions/[id]/todos/route.ts` — that is the whole shape.

**Errors are typed, and the `route()` wrapper maps them.**
`NotFound` → 404, `Invalid` → 400, `Unauthorized` → 401
(`src/lib/session/errors.ts`). Throw these from the store. Do not catch them
anywhere else, and do not hand-roll `NextResponse.json({ error }, { status })`.

**Mapping lives at the edge.** The database is snake_case, the domain is
camelCase, and `src/lib/session/mappers.ts` is where they meet. Domain types
never carry snake_case fields.

## Invariants that are easy to break

- **`updateSession` must return `supabaseResponse` unmodified**
  (`src/utils/supabase/proxy.ts`). Rebuilding the response desyncs the
  browser and server sessions and logs people out at random. The comment there
  says "load-bearing" and means it.
- **New session-scoped tables must be membership-scoped in RLS.**
  `src/lib/rls-ratchet.test.ts` walks `supabase/migrations/` and fails when a
  table with a `session_id` keeps `USING (true)` or `WITH CHECK (true)`.
  `KNOWN_OPEN` is empty and must stay that way — adding to it needs a written
  reason in that file, not a passing build.
- **The folder tree survives bad data rather than throwing.**
  `buildFolderTree` surfaces orphans and cycles at the root, because a blank
  hub is worse than an oddly-placed folder. Don't "fix" this by throwing.
- **Folder nesting is capped at `MAX_FOLDER_DEPTH = 3`**, enforced through
  `canMoveFolder` / `depthOf` in `src/lib/folders.ts` — including subtree
  height on a move, not just the destination's depth.
- **Access is by membership, never by knowing a URL.** Session ids in URLs are
  not secrets and are not access control. **Invite tokens are the exception**:
  `/join/<uuid>` is a bearer secret, and a different sensitivity class from a
  session id. Never log one, put one in an error message, or include one in a
  fixture.

## Environments

Local development runs Supabase in Docker via OrbStack. Production is a separate
linked Supabase project, kept in step through `supabase/migrations/` — never by
editing production directly.

**`supabase db query --linked` runs SQL against production and bypasses RLS.**
So does anything using `SUPABASE_SERVICE_ROLE_KEY`. Treat both as production
access: not for exploration, not for "just checking", and never to work around a
policy that is refusing you. If RLS is blocking a query, that is the system
working — fix the policy in a migration.

## Tests

Colocated as `src/**/*.test.ts`, vitest, node environment, no DOM. Pure logic
only today: parsers, geo maths, folder trees, mappers, the RLS ratchet.

`src/scraper` and `src/lib` are well covered. `src/app` (routes and API
handlers) and `src/components` are not — new work there should bring its own
coverage rather than match the neighbours.

**A test must fail without the change it defends.** Run `npm run test:teeth`
before you call a change done. A test that passes against the merge-base asserts
something that was already true and guards nothing.

Prefer ratchet tests over one-off assertions where a mistake is likely to
recur — `rls-ratchet.test.ts` is the model. It catches the "copy the pattern
from the neighbouring table" error that had already happened twice.

## Don't

- Don't edit `AGENTS.md` between the `nextjs-agent-rules` markers — `next dev`
  rewrites it. Project guidance goes in this file.
- Don't touch `.env*`, `supabase/config.toml`, or `.github/workflows/crawl.yml`
  without being asked; the crawler runs on a schedule with production secrets.
- Don't add a migration without checking `docs/runbooks/` for a cutover that
  covers the same tables.
- Don't rename domain concepts. `CONTEXT.md` lists the rejected synonym for each
  one, and those rejections were deliberate.

## Agent skills

### Issue tracker

GitHub Issues on `MathieuSchrurs/commonground`, via the `gh` CLI. Never put an
invite token or production data in an issue. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical role names, used verbatim: `needs-triage`, `needs-info`,
`ready-for-agent`, `ready-for-human`, `wontfix`.
See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root, no
`CONTEXT-MAP.md`. See `docs/agents/domain.md`.
