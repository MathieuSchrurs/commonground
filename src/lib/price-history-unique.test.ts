import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// The scraper's upsert already collapses duplicate (source, external_id)
// listings within one batch (see upsertListings in src/scraper/db.ts), but
// nothing stopped two runs — or a retry after a partial failure — from
// appending two price_history rows for the same (listing_id, recorded_at)
// pair. This asserts the migration history closes that gap with a uniqueness
// constraint, the same way rls-ratchet.test.ts asserts a property of the
// migration history rather than of one file.
const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

describe('price_history uniqueness', () => {
  it('has a UNIQUE constraint or index covering (listing_id, recorded_at)', () => {
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
    const sql = files.map((f) => readFileSync(join(MIGRATIONS, f), 'utf8')).join('\n');

    const hasUniqueConstraint =
      /ADD\s+CONSTRAINT\s+\w+\s+UNIQUE\s*\(\s*listing_id\s*,\s*recorded_at\s*\)/i.test(sql) ||
      /ADD\s+CONSTRAINT\s+\w+\s+UNIQUE\s*\(\s*recorded_at\s*,\s*listing_id\s*\)/i.test(sql);
    const hasUniqueIndex =
      /CREATE\s+UNIQUE\s+INDEX\s+\S+\s+ON\s+price_history\s*\(\s*listing_id\s*,\s*recorded_at\s*\)/i.test(sql) ||
      /CREATE\s+UNIQUE\s+INDEX\s+\S+\s+ON\s+price_history\s*\(\s*recorded_at\s*,\s*listing_id\s*\)/i.test(sql);

    expect(hasUniqueConstraint || hasUniqueIndex).toBe(true);
  });
});
