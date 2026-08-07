# 0003 — One meeting, not a history; and a decision is not a todo

## Status

Accepted

## Context

The dashboard shipped with two checklists that quietly leaked into each other.

`session_meetings` holds one row per session (`session_id UUID NOT NULL
UNIQUE`), upserted in place. `meeting_items` — the agenda — hangs off
`session_id` rather than off the meeting, a deliberate choice recorded in the
migration ("the agenda is for 'our next meeting' regardless of whether a pin is
set yet"). The consequence was not intended: setting the next meeting date
overwrites the previous meeting, but last week's agenda items survive, ticked
and unticked, mixed into the new agenda forever. The agenda never resets and no
meeting is ever remembered.

`session_todos` is titled "Decisions & todos" and modelled as `{title, done,
assigned_to}`. That fits "book a viewing Saturday". It does not fit "we agreed
max €650k", which has a date and a reason, constrains the hunt from then on,
and can be superseded but never *completed*. The card offered a checkbox next
to statements that cannot be checked off.

## Decision

**Keep one meeting per session — deliberately no history.** `UNIQUE(session_id)`
stays. A group of six does not want meeting-minutes ceremony; what they need to
survive is the *outcome*, not the calendar entry. So the meeting gains an
explicit **close** action: closing clears the agenda and writes what was agreed
into decisions. The record that persists is the set of decisions, not a list of
meetings.

**Split Decision from Todo.** A **Decision** gets its own table — text, when it
was decided, who by, and an optional supersession link — and pointedly **no
`done` flag**, because a decision is not completable. **Todos** keep theirs.
Both live in the existing "Decisions & todos" card as two sections, so the
dashboard does not grow a sixth card.

Decisions are the archive target that closing a meeting needs; without them the
close action has nowhere to put anything.

## Considered options

- **Meetings become a history** (drop `UNIQUE`, agenda attached to a
  `meeting_id`, unfinished items rolled forward). The most complete model, and
  the only one where "what did we decide on the 12th" survives as such.
  Rejected as ceremony out of proportion to six people who mostly need the
  conclusions — which the decisions log preserves anyway.
- **Leave the agenda as a permanent rolling list**, deleted by hand. Zero
  schema change, but it is the status quo that produced the bug.
- **Delete `meeting_items` and use filtered todos as the agenda.** Removes a
  table and the duplication, but conflates "raise this at the meeting" with
  "someone must do this", which are different states.
- **Drop "Decisions" from the card name and keep one list.** Cheapest, but
  leaves the group's accumulated agreements unstructured and unsearchable.
- **Model decisions as machine-readable constraints** that feed the search
  (max €650k → a budget filter). Attractive, and possibly where this goes, but
  it only works for the quantifiable ones and is a much larger build.

## Consequences

- **"No meeting history" is a choice, not a gap.** `UNIQUE(session_id)` will
  look like an oversight to anyone reading `session_meetings` cold. It is not
  — reversing it is the "meetings become a history" option above, and should be
  a deliberate revisit rather than a fix.
- **Closing a meeting is destructive.** Agenda items are cleared. Anything
  worth keeping must be written into a decision or a todo *at close time*, so
  the close action needs to prompt for that rather than silently wiping.
- **A new `session_decisions` table and route**, plus the Todos card growing a
  second section and the "Decisions & todos" heading finally being accurate.
