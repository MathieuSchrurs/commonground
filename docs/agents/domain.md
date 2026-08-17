# Domain Docs

How the engineering skills should consume this repo's domain documentation when
exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the domain glossary.
- **`docs/adr/`** — read the ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their
absence; don't suggest creating them upfront. The producer skill
(`/grill-with-docs`, or `domain-modeling`) creates them lazily when terms or
decisions actually get resolved.

## File structure

This is a single-context repo:

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-introduce-supabase-auth-accounts.md
│   ├── 0002-households-decide-objections-do-not-kill.md
│   └── 0003-one-meeting-and-decisions-are-not-todos.md
└── src/
```

There is no `CONTEXT-MAP.md` and there are no context-scoped ADR directories
under `src/`. If this ever becomes a multi-context repo, add `CONTEXT-MAP.md` at
the root pointing at one `CONTEXT.md` per context, and update this section.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal,
a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift
to synonyms the glossary explicitly avoids.

`CONTEXT.md` records the rejections directly: each entry ends with an `_Avoid_:`
line listing the words *not* to use for that concept. Those rejections are
deliberate — "vote", "veto", "user" and "room" are bugs here, not style. Treat
an `_Avoid_` word appearing in your output the same as a failing check.

If the concept you need isn't in the glossary yet, that's a signal — either
you're inventing language the project doesn't use (reconsider) or there's a real
gap (note it, and let the domain-modeling skill resolve it).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than
silently overriding:

> _Contradicts ADR-0002 (households decide) — but worth reopening because…_

The three ADRs here are settled decisions that new code must not quietly
reverse. `0002` in particular is easy to break by counting people instead of
households, and `0003` by treating a decision as a todo.
