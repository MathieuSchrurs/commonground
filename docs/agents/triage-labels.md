# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those
roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

The names map 1:1 — this repo uses the canonical vocabulary unchanged.
`ready-for-agent` and `wontfix` already carried this meaning on existing issues;
the other three were created to complete the set.

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the
corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use. If you
rename a label on GitHub, rename it here in the same change — a label string
that exists in only one of the two places is how duplicates get created.

## What `ready-for-agent` means here

An agent picking up the issue gets no human context beyond the issue body. In
this repo that bar includes: which store function or route the change lives
behind, and what the defending test asserts. `npm run test:teeth` must be able
to prove that test fails at the merge-base — an issue that can't say what would
fail isn't specified yet.
