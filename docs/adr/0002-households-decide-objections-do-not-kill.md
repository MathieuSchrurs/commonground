# 0002 — Households decide, and an objection does not kill a listing

## Status

Accepted

## Context

The dashboard's convergence cards counted people. `computeFavorites` set
`unanimous: loves.length === users.length` and `GroupFavoritesCard` surfaced
`loveCount >= 2`. Both are wrong for the group this app exists to serve.

Three couples produce **six** `session_users` rows, because six people have six
jobs and therefore six commute constraints. But six people are not six deciders
— three couples buy one house. So `users.length` is 6, "everyone loves this"
can essentially never fire, and `loveCount >= 2` is satisfied by one couple
agreeing with itself. The denominator was never the deciding unit.

`veto` had a parallel problem in the other direction. The word promises a kill
switch; nothing in the code kills anything. `GroupFavoritesCard` renders vetoed
listings with the objectors' names printed underneath, and the two cards
overlap — a listing with two loves and one veto rendered in *both* Group
favorites and To-talk-about, on the same screen.

## Decision

**Introduce Household as the deciding unit**, sitting between Session and
participant: a `households` table (session-scoped, named) plus a nullable
`household_id` on `session_users`. A participant belonging to no household **is
a household of one**. This keeps the count from ever being zero, makes a solo
co-buyer a first-class case, and — because six unpaired participants are six
households — means the migration reproduces today's behavior exactly until
someone actually pairs up.

**A household holds a position on a listing**, derived from its members'
reactions: _yes_, _split_, _no_, or _silent_. Silence does not block: one
partner speaks for the household until the other contradicts them, at which
point the position becomes _split_ — an unresolved conversation inside the
couple, deliberately not collapsed into a "no".

**An objection is an opening position, not a kill.** A listing stays alive and
visible while objections stand. Removing a house from the hunt is a deliberate
group act, reserved for the status pipeline planned in `ROADMAP.md` Phase 2 —
so there is exactly one kill mechanism. Accordingly the reaction is renamed
`veto` → `object` (noun: **Objection**) across the schema, the store, and the
UI, including a migration that rewrites existing rows and swaps the
`CHECK (reaction IN ('love','veto'))` constraint.

**The two cards partition on objections** instead of overlapping. Group
favorites holds listings two or more households are _yes_ on with no objection
anywhere, ranked by household support. To-talk-about holds every listing with a
standing objection, ranked by closeness to consensus, each entry showing the
per-household breakdown so the shape of the disagreement is readable.

## Considered options

- **A flat person model with better thresholds.** Cheapest, and tempting since
  the schema already supports it. Rejected because no threshold over people
  recovers the fact that a couple is one decider — and because `ROADMAP.md`
  already requires households for per-couple budgets and cost-per-couple, so
  the entity would be built twice.
- **`partner_id` self-reference instead of a table.** Smaller migration, but
  hard-codes "household = exactly 2 people" and gives the budget nowhere to
  live.
- **A household NO is fatal.** Honest to how co-buying really works, but it
  creates a second kill mechanism that will disagree with the status pipeline,
  and it empties the To-talk-about card of the debates that justify its
  existence.
- **Keeping `veto` in storage and renaming only in the UI.** No migration, no
  data rewrite — but it leaves two vocabularies for one concept, which is the
  exact failure `CONTEXT.md` exists to prevent. The dataset is six people's
  reactions; it will never be cheaper to rename than now.

## Consequences

- **A data migration against live rows.** `UPDATE listing_reactions SET
  reaction = 'object' WHERE reaction = 'veto'` plus a constraint swap, against
  production data. Small today, and the reason to do it now.
- **~44 occurrences of `veto` across 12 files** — including `Map.tsx`,
  `ShortlistPanel.tsx`, `store.ts`, and three test files — change with it. The
  map's gray-out styling and the shortlist keep their behavior; only the name
  moves.
- **Household assignment becomes a setup affordance** that does not yet exist.
  Nothing blocks on it (household-of-one covers the gap), but until there is a
  UI for pairing, the household model is inert.
- **`computeFavorites` and `computeSplitVotes` are rewritten** to operate on
  household positions rather than reaction tallies. Both are shared with the
  map's Shortlist panel, so the map's ranking changes too — intentionally, so
  the two surfaces keep agreeing.
