# 0001 — Introduce Supabase Auth and an account model

## Status

Accepted

## Context

CommonGround has been deliberately login-less. Identity is a per-browser
`localStorage` pick of a `session_user`: the user opens a session URL, picks
"who am I" once, and that choice is remembered only in that browser. The
rationale (documented in `IdentityPicker.tsx`, `ROADMAP.md` Phase 2, and the
**Session** entry in `CONTEXT.md`) was that six people who trust each other
don't need accounts to vote on houses.

That model has hit its limits as the app grows past a single shared map:

- **No cross-device recognition.** The same person on their phone and their
  laptop is two different identities. Reactions, favorites, and the dashboard
  can't follow a person across devices.
- **No persistent, trustworthy login.** A cleared browser or a new device
  means re-picking from a dropdown. Nothing actually authenticates the claim
  "I am Mathieu" — anyone with the URL can vote as anyone.
- **The app can't know who is logged in.** Features that are arriving — a
  per-person dashboard, meeting notes with an author, uploaded files with an
  owner (issues #3–#10) — need a stable, authenticated principal, not a
  dropdown selection. `listing_reactions.user_id`,
  `session_meetings.updated_by`, and `shared_files.uploaded_by` all attribute
  data to a `session_user`, but that `session_user` is presently unowned.
- **No notion of "the sessions I belong to."** A session is reachable only by
  knowing its random UUID. There is no landing experience that lists the hunts
  a given person created or was invited to.

The security posture reflects the trust assumption: row-level security is
effectively "Allow all" (`USING (true)` / `FOR ALL`) across the session-scoped
tables. That is acceptable for a handful of trusted people sharing one secret
URL; it is not acceptable once accounts exist and the URL is no longer the only
gate.

## Decision

Introduce real authentication via **Supabase Auth**.

- **Google sign-in first.** It needs no email infrastructure, which lets us ship
  authentication immediately. **Email/password is a fast-follow** once SMTP
  (Resend) is configured — Resend is already the planned provider for the Phase
  1 listing alerts, so the dependency is shared.
- **Persistent login via `@supabase/ssr` cookies + Next.js middleware.** The
  middleware refreshes the session on every request and makes the authenticated
  user available to Server Components, route handlers, and the **Session store**
  seam, replacing the `localStorage` identity pick.

Layer an account model on top of the existing schema rather than replacing it:

- **Account** — an authenticated person, backed by `auth.users`. The login
  principal.
- **Profile** — a `profiles` table mirroring `auth.users` (display name, email,
  avatar), so the UI can show names and avatars without reaching into the
  protected `auth` schema.
- **Membership** — a new `session_members` table linking an Account to a
  Session. This powers "the sessions I created or belong to" and is the unit an
  invite grants.
- **Session gains a human-readable `name` and a `created_by` owner.** A hunt is
  no longer only a random UUID; it has a name people recognise and an owner.

The per-session **Commute constraint** (`session_users`) **stays** as-is and
gains an `account_id` link to its owning Account. Crucially, the existing
foreign keys — `listing_reactions.user_id`, `session_meetings.updated_by`, and
`shared_files.uploaded_by`, all pointing at `session_users.id` — remain intact.
Accounts are layered *over* `session_users`; they do not replace it. A
`session_user` is now the in-session presence of an Account (its commute
requirement and its attributed reactions/edits/uploads), while the Account is
the identity that signs in.

## Consequences

- **RLS rework, away from "Allow all".** Every session-scoped policy
  (`USING (true)` / `FOR ALL`) must be rewritten to authorize against
  `session_members` — a row is visible/writable only to Accounts that are
  members of its Session. This is the largest piece of follow-up work and the
  main reason the change is more than "add a login button".
- **An email/SMTP dependency for email/password.** The email/password path
  can't ship until Resend SMTP is wired into Supabase Auth (confirmation and
  reset emails). Google sign-in deliberately avoids blocking on this.
- **A one-off backfill to claim existing live sessions.** Sessions already in
  production have no `created_by`, no `name`, and their `session_users` have no
  `account_id`. A migration must mint Profiles/Memberships and let the real
  people claim their existing `session_user` rows so their history (reactions,
  uploads, meeting edits) carries over rather than orphaning.
- **An invite flow becomes necessary.** With Membership gating access, joining a
  session is no longer "open the URL." Invitations (by email or shareable link)
  become the way a Session owner adds people — tracked in the follow-up issues
  (#3–#10).
- **Reverses a documented stance.** `ROADMAP.md`, `IdentityPicker.tsx`, and
  `CONTEXT.md` all assert "no login." Those are updated alongside this ADR; the
  **Session** entry in `CONTEXT.md` and the new **Account** / **Membership** /
  **Profile** entries are the canonical description going forward.
- **`@supabase/ssr` and middleware add request-time overhead and a new failure
  mode** (token refresh). Acceptable, and standard for Supabase + Next.js App
  Router.
