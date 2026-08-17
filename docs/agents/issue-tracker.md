# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues on
`MathieuSchrurs/commonground`. Use the `gh` CLI for all operations — it infers
the repo from `git remote -v` when run inside the clone.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## What must never go in an issue

Issues on this repo are public. Two rules from `CLAUDE.md` apply with full force
here, because an issue body is harder to redact than a log line:

- **Never include an invite token.** `/join/<uuid>` is a bearer secret — anyone
  holding one can join a session. Session ids are not secrets and may appear;
  invite tokens are a different sensitivity class and may not, not even in a
  repro step or a pasted URL.
- **Never paste production data or service-role output.** Anything obtained via
  `supabase db query --linked` or `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS.
  Describe the shape of the problem instead of the rows.

## Naming

Issue titles and bodies name domain concepts using the vocabulary in
`CONTEXT.md` — see `docs/agents/domain.md`. "Vote", "veto", "user" and "room"
are rejected synonyms, not stylistic variation.
