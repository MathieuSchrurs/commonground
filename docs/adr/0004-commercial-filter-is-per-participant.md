# 0004 — The commercial-listing filter is per participant, not per household

## Status

Accepted

## Context

Issue #27 asked for a way to hide commercial real estate from property
listings. Triage settled the shape: a new `commercial` `property_type`
(distinct from today's catch-all `other`), filtered via a persisted,
hidden-by-default toggle rather than a scraper-level exclusion or a stateless
query flag.

The open question was *whose* toggle it is. [ADR 0002](0002-households-decide-objections-do-not-kill.md)
established that a **household**, not an individual participant, is this
app's unit of agreement — a session of three couples has six participants but
three households, and reactions aggregate to one household position
(_yes_/_split_/_no_/_silent_) rather than being tracked per member. A
`households` table already exists (`session_users.household_id`) precisely to
support that aggregation.

A toggle scoped to `households` would follow that pattern: both partners see
the same filtered listing set, consistent with everything else a household
does together in a hunt. A toggle scoped to `session_users` (one row per
participant) does not — two partners could end up looking at different
listing sets, one seeing a commercial listing the other has hidden.

## Decision

**The toggle lives on `session_users`, per participant, not per household.**
This is the cheaper option and was chosen for that reason — it's a new column
next to the existing per-participant preferences (`max_minutes`,
`transport_mode`) rather than a new join through `households`, and it needs no
aggregation logic for the "what does this household see" question that a
household-scoped version would.

## Considered options

- **Per household** (`households` table). Matches ADR 0002's aggregation
  pattern — both partners always see the same listings. Rejected for now
  because it needs a household-scoped column plus whatever join or lookup
  resolves "which household is this participant in" at every place listings
  are filtered, versus reading the toggle straight off the participant's own
  row.

## Consequences

- **This is a deliberate deviation from ADR 0002's household-decides pattern,
  not an oversight.** A future reader who notices that two partners can see
  different listing sets — one hiding commercial, the other not — should not
  "fix" this by silently changing scope; that's the household-scoped option
  above, and it's a real migration, not a bug fix.
- **Two members of the same household can end up reacting to a shared
  listing pool that isn't actually shared for commercial listings.** One
  partner could react on a commercial listing the other has hidden and will
  never see. Convergence handles this the same way it would if the listing
  simply never matched a household's search: hiding excludes that household
  from the convergence requirement for the listings it hides, rather than
  counting as silence that blocks convergence.
- **Revisiting this** means moving the column from `session_users` to
  `households`, migrating existing per-participant values (last-write-wins,
  or asking the household to reconcile), and updating every place that reads
  the toggle to resolve it via `household_id` instead of the participant row.
