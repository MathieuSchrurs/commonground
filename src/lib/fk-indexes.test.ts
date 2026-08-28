import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Foreign-key columns used in cascade deletes or common query filters need a
// supporting index, or a delete/filter on the referenced row forces a
// sequential scan over every row in the referencing table. This replays
// CREATE INDEX / DROP INDEX statements across all migrations, in filename
// order, so an index added by one migration and dropped by a later one
// doesn't count — mirrors the replay in rls-ratchet.test.ts.

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

const clean = (t: string) => t.replace(/"/g, '').replace(/^public\./, '');

const createIndexRe =
  /create\s+index\s+(?:if\s+not\s+exists\s+)?([\w."]+)\s+on\s+([\w."]+)\s*\(([^)]*)\)/gi;
const dropIndexRe = /drop\s+index\s+(?:if\s+exists\s+)?([\w."]+)/gi;

type IndexInfo = { table: string; columns: string[] };

// The (table, leading-column) pairs this migration set is expected to cover.
// A composite index leading with a different column (e.g. session_users'
// existing (session_id, account_id)) does not satisfy a need for
// account_id alone, since Postgres can only use a leading prefix of a
// btree index.
const NEEDED: { table: string; column: string }[] = [
  { table: 'listing_reactions', column: 'listing_id' },
  { table: 'shared_files', column: 'listing_id' },
  { table: 'shared_files', column: 'folder_id' },
  { table: 'session_users', column: 'account_id' },
  { table: 'candidates', column: 'session_id' },
];

function replayIndexes(all: string[]): Map<string, IndexInfo> {
  const active = new Map<string, IndexInfo>();

  for (const sql of all) {
    for (const [, name] of sql.matchAll(dropIndexRe)) {
      active.delete(clean(name));
    }

    for (const [, name, table, columns] of sql.matchAll(createIndexRe)) {
      active.set(clean(name), {
        table: clean(table),
        columns: columns.split(',').map((c) => clean(c.trim())),
      });
    }
  }

  return active;
}

describe('foreign-key index coverage', () => {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  const all = files.map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'));
  const active = replayIndexes(all);

  it('finds indexes at all, so a parsing regression does not pass vacuously', () => {
    expect(active.size).toBeGreaterThan(0);
  });

  it.each(NEEDED)('has an index on $table leading with $column', ({ table, column }) => {
    const covered = [...active.values()].some((idx) => idx.table === table && idx.columns[0] === column);
    expect(covered).toBe(true);
  });
});
