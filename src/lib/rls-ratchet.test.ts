import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// A ratchet, not an audit.
//
// Session-scoped tables were opened with `USING (true)` back when the app was
// login-less, then tightened to membership in 20260620160000 per ADR 0001.
// Twice since, a new table has been added copying the *old* pattern —
// `session_todos`/`meeting_items`, and `households` — because "match the
// neighbours" reads the neighbour that was written first.
//
// This test fails when a table with a session_id gets a permissive policy that
// nothing later tightens. The two known-open tables are listed below; the list
// may shrink, never grow.
const KNOWN_OPEN = new Set(['meeting_items', 'session_todos']);

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

// Every table declaring a session_id — the ones whose rows belong to one hunt
// and must therefore be readable only by that hunt's members.
function sessionScopedTables(sql: string): Set<string> {
  const found = new Set<string>();
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?([\w.]+)\s*\(([\s\S]*?)\n\);/gi;
  for (const [, table, body] of sql.matchAll(re)) {
    if (/\bsession_id\b/i.test(body)) found.add(table.replace(/^public\./, ''));
  }
  return found;
}

describe('row-level security ratchet', () => {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  const all = files.map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'));

  // Replay the migrations in order so a policy that was later dropped or
  // replaced doesn't count against the table that fixed it.
  const scoped = new Set<string>();
  const active = new Map<string, { table: string; permissive: boolean }>();

  for (const sql of all) {
    for (const t of sessionScopedTables(sql)) scoped.add(t);

    for (const [, name, table] of sql.matchAll(/drop\s+policy\s+(?:if\s+exists\s+)?"([^"]+)"\s+on\s+([\w.]+)/gi)) {
      active.delete(`${table.replace(/^public\./, '')}::${name}`);
    }

    for (const [, name, table, body] of sql.matchAll(/create\s+policy\s+"([^"]+)"\s+on\s+([\w.]+)([\s\S]*?);/gi)) {
      const t = table.replace(/^public\./, '');
      const permissive = /using\s*\(\s*true\s*\)/i.test(body);
      active.set(`${t}::${name}`, { table: t, permissive });
    }
  }

  it('finds the session-scoped tables it is meant to be guarding', () => {
    // If the CREATE TABLE parsing silently breaks, every assertion below
    // passes vacuously — so pin the tables we know are in there.
    expect(scoped).toContain('households');
    expect(scoped).toContain('session_users');
    expect(scoped).toContain('listing_reactions');
    expect(scoped).toContain('session_todos');
  });

  it('leaves no session-scoped table readable by anyone holding a session id', () => {
    const open = [...active.values()]
      .filter((p) => p.permissive && scoped.has(p.table) && !KNOWN_OPEN.has(p.table))
      .map((p) => p.table);

    expect([...new Set(open)]).toEqual([]);
  });

  it('keeps the known-open list from growing', () => {
    const stillOpen = new Set(
      [...active.values()].filter((p) => p.permissive && scoped.has(p.table)).map((p) => p.table),
    );
    for (const table of KNOWN_OPEN) {
      // Remove an entry from KNOWN_OPEN once it is tightened; never add one.
      expect(stillOpen).toContain(table);
    }
  });
});
