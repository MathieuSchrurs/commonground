#!/usr/bin/env bash
#
# Proves that the tests changed on this branch actually constrain the change:
# they must FAIL at the merge-base and PASS at HEAD.
#
# A test written after the implementation, by a human or an agent, very often
# passes against the old code too — which means it asserts something that was
# already true and guards nothing. This catches that.
#
#   ./scripts/test-teeth.sh            # vs origin/main
#   ./scripts/test-teeth.sh main       # vs a different base
#
# Kept compatible with the bash 3.2 that macOS still ships: no mapfile,
# no associative arrays, no ${var^^}.
#
set -euo pipefail

BASE_REF="${1:-origin/main}"
BASE_SHA="$(git merge-base "$BASE_REF" HEAD)"
PROBE="$(mktemp -d)/probe"

cleanup() {
  # Unlink before removing the worktree. node_modules in there is a symlink to
  # the real one, and nothing in this script should ever be able to delete
  # through it.
  if [ -L "$PROBE/node_modules" ]; then
    rm -f "$PROBE/node_modules"
  fi
  git worktree remove --force "$PROBE" 2>/dev/null || true
}
trap cleanup EXIT

# --diff-filter=d so deleted tests don't get resurrected into the probe tree.
TEST_FILES=()
while IFS= read -r f; do
  [ -n "$f" ] && TEST_FILES+=("$f")
done < <(git diff --name-only --diff-filter=d "$BASE_SHA"...HEAD | grep -E 'src/.*\.test\.tsx?$' || true)

if [ "${#TEST_FILES[@]}" -eq 0 ]; then
  echo "FAIL: no test files added or changed vs ${BASE_REF} (${BASE_SHA:0:8})" >&2
  echo "      Every work unit ships a test. If this change genuinely cannot be" >&2
  echo "      tested, that is a decision for a human, not a thing to skip." >&2
  exit 2
fi

echo "Base:  ${BASE_SHA:0:8}"
echo "Tests: ${TEST_FILES[*]}"
echo

git worktree add --detach "$PROBE" "$BASE_SHA" >/dev/null

# Put HEAD's version of each test file onto the old tree.
for f in "${TEST_FILES[@]}"; do
  mkdir -p "$PROBE/$(dirname "$f")"
  git show "HEAD:$f" > "$PROBE/$f"
done

# The probe needs the alias config even if the base commit predates it.
if [ ! -f "$PROBE/vitest.config.ts" ]; then
  cp vitest.config.ts "$PROBE/vitest.config.ts"
fi

# Symlink rather than `npm ci` into the probe: this runs on every work unit and
# a full install each time would be unusable. The tradeoff is that if the branch
# ADDED a dependency the new test needs, the probe fails with module-not-found
# rather than a real assertion failure — which would look like a pass. The
# INCONCLUSIVE guard below catches the common shape of that.
ln -s "$PWD/node_modules" "$PROBE/node_modules"

echo "→ running the new tests against base (expecting them to FAIL)"
set +e
BASE_OUT="$(cd "$PROBE" && npx vitest run "${TEST_FILES[@]}" 2>&1)"
BASE_CODE=$?
set -e

if [ "$BASE_CODE" -eq 0 ]; then
  echo "$BASE_OUT" | tail -20
  echo >&2
  echo "FAIL: these tests already pass against ${BASE_SHA:0:8}." >&2
  echo "      They assert something that was true before the change, so they do" >&2
  echo "      not protect it. Rewrite them to fail without the new code." >&2
  exit 1
fi

if echo "$BASE_OUT" | grep -qiE "cannot find (module|package)|failed to resolve import"; then
  echo "$BASE_OUT" | tail -20
  echo >&2
  echo "INCONCLUSIVE: the tests failed at base by failing to load, not by failing" >&2
  echo "      an assertion — usually a new dependency or a new source file." >&2
  echo "      That is not evidence the test has teeth. Check by hand." >&2
  exit 3
fi

echo "  ✓ failed at base, for the right reason"
echo
echo "→ running the full suite at HEAD (expecting PASS)"
npm test

echo
echo "OK: tests fail at ${BASE_SHA:0:8}, pass at HEAD."
