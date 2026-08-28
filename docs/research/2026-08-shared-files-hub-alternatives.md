# Could a third-party library replace the shared-files hub?

Research for issue #28. No code was changed to produce this document; no
migrations were run.

## What exists today

The shared-files hub is three pieces:

- **Folder logic** — `src/lib/folders.ts`. Pure functions: `buildFolderTree`
  (cycle- and orphan-safe tree assembly), `ancestorChain`/`depthOf` (breadcrumb
  and depth), `canMoveFolder` (self/descendant/depth-limit checks against
  `MAX_FOLDER_DEPTH = 3`, measured against subtree height, not just the
  destination), `fileMoveDestinations`/`folderMoveDestinations`. Backed by 260
  lines of tests (`src/lib/folders.test.ts`).
- **Storage** — files upload straight from the browser into a Supabase Storage
  bucket (`shared-files`); `src/lib/session/store.ts`'s `recordFile` then
  writes a `shared_files` row (`storage_path`, `folder_id`, `listing_id`,
  `note`, …) once the bytes land. Folder hierarchy itself lives in a
  `session_folders` table (`parent_id` self-reference), not in Storage.
  Concurrent folder moves go through a `move_folder` Postgres RPC that locks
  the session's folders for the transaction — the comment in `store.ts`
  explains this is specifically to stop two concurrent moves ("A into B" and
  "B into A") from each validating against a pre-move snapshot and creating a
  cycle no single write's trigger would catch.
- **UI** — `src/components/dashboard/SharedFilesCard.tsx` (609 lines):
  breadcrumbs, a "Move to" menu built from `fileMoveDestinations`, an upload
  form with a house-attachment dropdown (`listingId`), folder create/rename/
  delete.

The domain-specific piece the brief calls out — attaching a file to a house —
is a nullable `listing_id` foreign key on `shared_files` pointing at
`property_listings`. Nothing generic has this out of the box; it's one column
and one dropdown, not an architecture.

## Candidate 1 — Supabase Storage's own folder support

Supabase Storage buckets have no real folder objects. Uploading to
`users/123/reports/2024-q1.pdf` auto-derives the folder structure from the key
prefix, and `.list()` can filter by prefix — but that's it.
[Storage docs](https://supabase.com/docs/guides/storage) and the
[quickstart](https://supabase.com/docs/guides/storage/quickstart) describe
prefix-based listing; there is no move/rename-folder endpoint. Supabase's own
troubleshooting article confirms the gap directly:

> Supabase Storage lacks genuine folder objects... hierarchical organization
> is purely conceptual... implementing hierarchical access controls is
> difficult because there's no built-in permission inheritance... \[the
> recommended fix is to\] create a custom Postgres table to model folder
> hierarchies, storing folder IDs, parent relationships, and permissions, then
> link it to `storage.objects` records.
> — [Supabase Storage: Inefficient folder operations and hierarchical RLS challenges](https://supabase.com/docs/guides/troubleshooting/supabase-storage-inefficient-folder-operations-and-hierarchical-rls-challenges-b05a4d)

That recommended fix is, structurally, exactly what `session_folders` +
`src/lib/folders.ts` already are. There's no native feature to adopt here —
Supabase's own docs point back at the pattern this app already built.

**License / maintenance**: N/A (already the storage backend in use).
**Migration effort**: none — nothing to migrate to. Confirms the current
design isn't fighting the platform, it's following the platform's documented
workaround.

## Candidate 2 — a headless/UI React file-manager component

Two real options exist; one is dead, one is a viable UI-only swap.

### Chonky (`TimboKZ/Chonky`)

- Repo: [github.com/TimboKZ/Chonky](https://github.com/TimboKZ/Chonky) — 788
  stars, 190 forks, MIT license, 73 open issues.
- **Last push: 2024-01-09** — over two and a half years stale as of this
  writing (2026-08). Not formally archived, but dormant.
- A community fork, `aperturerobotics/react-chonky`, kept it alive a bit
  longer (41 stars) but GitHub's own repo metadata shows it was **archived by
  its owner on 2025-12-16** and is now read-only.
- Verified directly via `gh api repos/TimboKZ/Chonky` and
  `gh api repos/aperturerobotics/react-chonky` (`pushed_at`, `archived: true`,
  `license.spdx_id: "MIT"`).

Ruled out: no realistic path to build on a component whose upstream is
abandoned and whose most-active fork is now archived.

### `@cubone/react-file-manager` (repo: `Saifullah-dev/react-file-manager`)

- Repo: [github.com/Saifullah-dev/react-file-manager](https://github.com/Saifullah-dev/react-file-manager)
  (confirmed as the source for the npm package via its GitHub `homepage`
  field). MIT license. 154 stars, 68 forks, 20 open issues.
- Actively maintained: releases through `v1.35.0` on 2025-12-23, last push
  2026-04-20 (`gh api repos/Saifullah-dev/react-file-manager`).
- Maintenance concentration: `gh api .../contributors` shows 309 commits from
  the primary author (`Saifullah-dev`) against 36 from `dependabot[bot]` and
  single digits from everyone else (highest human contributor: 6 commits).
  Effectively a solo-maintained project — active, but a bus-factor of one.
- What it actually is, confirmed from its README: a **pure frontend UI
  component**. It renders a file-manager UI and exposes callbacks
  (`onFileUploaded`, `onCreateFolder`, `onRename`, `onDelete`, `onPaste` for
  move/copy, `onFolderChange`, …) that the host app implements against its own
  backend. It ships no storage, no persistence, and — critically — **no depth
  limit, no cycle-safety, and no per-file metadata/attachment concept**. Its
  file shape is `{ name, isDirectory, path, updatedAt, size }`; there's
  nowhere to hang a `listing_id` without working around the library's own
  data model.

**What adopting it would actually replace**: only `SharedFilesCard.tsx`'s
presentation layer (609 lines, built today on this app's existing shadcn
components). Every invariant in `folders.ts` — the depth cap measured against
subtree height, the cycle guard in `buildFolderTree`, the concurrent-move
locking via the `move_folder` RPC — would still have to be written and
maintained by this app, wired into the library's callbacks instead of into
custom UI. The house-attachment dropdown would also need to be built
alongside the library rather than through it, since the library has no
concept of it.

**Migration effort/risk**: rip out and rewrite an existing, working,
tested UI component to gain a UI shell around a maintainer of one, in
exchange for keeping ~100% of the actual hard logic (`folders.ts` and its 260
lines of tests) unchanged. Low reward for real effort and a new single point
of failure in a third-party dependency.

## Candidate 3 — a DAM (digital asset management) SaaS: Cloudinary / Uploadcare

Both provide upload, storage, transformations, and a hosted API — a much
bigger scope swap (this app currently uses Supabase Storage only for bytes;
these would replace that layer too).

### Cloudinary

- **Structured metadata** ([docs](https://cloudinary.com/documentation/structured_metadata),
  [custom metadata API docs](https://cloudinary.com/documentation/custom_metadata))
  lets you define typed custom fields (text, number, date, single/multi-select)
  applied across assets and settable via API. This *could* hold a `listingId`
  string per file, which is the closest any candidate gets to "attach to a
  house" — but it's a flat custom field on an asset in a separate system, not
  a foreign key Postgres/Supabase can join against. Every place the app
  currently reads "files attached to this listing" via a normal SQL query
  (`shared_files.listing_id`) would instead need a call out to Cloudinary's
  search API, or a duplicated mirror table kept in sync — a new class of bug
  (drift between the two stores) that doesn't exist today.
- **No nested-folder-with-depth-cap concept.** Cloudinary organizes assets by
  folder path or tags, not by an entity with the enforced-depth/cycle-safety
  semantics this app requires.
- **Pricing** ([cloudinary.com/pricing](https://cloudinary.com/pricing)):
  free tier is 25 credits/month (1 credit ≈ 1,000 transformations, 1GB
  storage, or 1GB bandwidth); the first paid tier ("Plus") is $99/month for
  225 credits. For a 3-couple house-hunt app this is a large, ongoing,
  disproportionate cost for a feature that currently runs on the Supabase
  plan already paid for.
- **RLS / access model mismatch**: this app's entire access model is
  membership-scoped Postgres RLS, enforced by a ratchet test
  (`src/lib/rls-ratchet.test.ts`) that fails CI if a session-scoped table
  isn't locked down. Cloudinary has its own, separate access-control system
  (API keys, "asset access controls" only on paid tiers per the pricing page
  above). Moving files there means access control for shared files would no
  longer be governed by the same membership check as every other
  session-scoped resource — a second security model to keep in sync with the
  first, which is exactly the kind of drift `CONTEXT.md`'s "session store is
  the only seam" invariant exists to prevent.

### Uploadcare

- **Groups, not folders**: Uploadcare organizes files into "file groups", not
  a folder tree.
  [Uploadcare's own docs](https://uploadcare.com/docs/file-groups/) describe
  groups as flat collections capped at 1,000 files each, mainly intended for
  multi-page document conversion and video-thumbnail sets — not a
  nested-folder browsing experience, and with no depth or cycle concept at
  all.
- **Pricing**: free tier is 3,000 uploads / 30GB traffic / 3GB storage; the
  first paid tier is $20/month, usage-based beyond that
  ([uploadcare.com/pricing](https://uploadcare.com/pricing/)).
- Same RLS/access-model mismatch as Cloudinary applies here too.

**Migration effort/risk for either DAM**: the largest of all candidates
considered — it would mean moving the byte-storage layer off Supabase
Storage entirely, re-implementing "attach to a house" as a cross-system
metadata lookup instead of a SQL join, re-implementing folder depth/cycle
safety from scratch (neither product has it), and introducing a second,
differently-shaped access-control system alongside the RLS ratchet this repo
already enforces. Realistic risk: high. Realistic benefit: none of the parts
that are actually hard today (nested folders, house-attachment) come free.

## Recommendation

**Keep the bespoke system.**

Nothing evaluated actually removes the two pieces of custom logic that matter:
cycle-safe, depth-capped nested folders, and attaching a file to a house.

- Supabase Storage's own docs confirm there's no native folder feature to
  adopt — the officially-documented workaround for exactly this gap is a
  custom Postgres table mapping the hierarchy, which is what `session_folders`
  and `src/lib/folders.ts` already are.
- The one actively-maintained headless file-manager component
  (`@cubone/react-file-manager`) is UI-only: adopting it would mean rewriting
  a working, tested 609-line component to sit atop a solo-maintained
  dependency, while every invariant this issue actually cares about (depth
  cap, cycle safety, concurrent-move locking, house-attachment) stays
  hand-written regardless, just wired through different callbacks. The other
  realistic option, Chonky, is dead upstream (last push January 2024) and its
  most-maintained fork was archived in December 2025.
- The DAM services (Cloudinary, Uploadcare) solve upload and storage, which
  this app already has solved via Supabase Storage, but neither has a real
  nested-folder concept (Uploadcare's "groups" are flat and capped at 1,000
  files; Cloudinary has folders/tags, not depth-capped cycle-safe trees), and
  "attach to a house" would degrade from a SQL foreign key to a
  cross-system metadata field with no referential integrity. Both would also
  introduce a second access-control system running alongside the
  membership-based RLS this app's CI already ratchets against — real
  architectural risk for a feature that isn't broken.

The existing code is small, already well-tested (`src/lib/folders.test.ts`,
260 lines), and its trickiest correctness property (concurrent folder moves
racing into a cycle) is handled deliberately via a locking RPC rather than
by accident. There's no candidate here where adopting it is less total work
than what's already shipped and working. Revisit only if a future
requirement genuinely needs DAM-grade features this app doesn't have today —
image transformations, external sharing links, virus scanning at scale — none
of which this issue's brief asked for.

## Sources

- [Supabase Storage docs](https://supabase.com/docs/guides/storage)
- [Supabase Storage quickstart](https://supabase.com/docs/guides/storage/quickstart)
- [Supabase Storage troubleshooting: inefficient folder operations and hierarchical RLS challenges](https://supabase.com/docs/guides/troubleshooting/supabase-storage-inefficient-folder-operations-and-hierarchical-rls-challenges-b05a4d)
- [TimboKZ/Chonky](https://github.com/TimboKZ/Chonky) (`gh api repos/TimboKZ/Chonky`)
- [aperturerobotics/react-chonky](https://github.com/aperturerobotics/react-chonky) (`gh api repos/aperturerobotics/react-chonky`, archived 2025-12-16)
- [Saifullah-dev/react-file-manager](https://github.com/Saifullah-dev/react-file-manager) / npm `@cubone/react-file-manager` (`gh api repos/Saifullah-dev/react-file-manager`, `.../contributors`, `.../releases`, and its README)
- [Cloudinary structured metadata](https://cloudinary.com/documentation/structured_metadata)
- [Cloudinary custom metadata API](https://cloudinary.com/documentation/custom_metadata)
- [Cloudinary pricing](https://cloudinary.com/pricing)
- [Uploadcare file groups](https://uploadcare.com/docs/file-groups/)
- [Uploadcare pricing](https://uploadcare.com/pricing/)
- This repo: `src/lib/folders.ts`, `src/lib/folders.test.ts`, `src/lib/session/store.ts`, `src/components/dashboard/SharedFilesCard.tsx`, `src/types/files.ts`, `src/lib/rls-ratchet.test.ts`, `CONTEXT.md`
