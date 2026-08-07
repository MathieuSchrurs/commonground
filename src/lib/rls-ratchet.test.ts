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
// This test fails when a table with a session_id keeps a permissive policy that
// nothing later tightens. The two known-open tables are listed below; the list
// may shrink, never grow.
const KNOWN_OPEN = new Set(['meeting_items', 'session_todos']);

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

// `USING (true)` lets anyone read and `WITH CHECK (true)` lets anyone write, so
// either one alone leaves the table open — a policy reading rows by membership
// but accepting any insert is still a way into someone else's session.
function isPermissive(body: string): boolean {
  return /\busing\s*\(\s*true\s*\)/i.test(body) || /\bwith\s+check\s*\(\s*true\s*\)/i.test(body);
}

// Policy names may or may not be quoted; both forms are legal SQL and a future
// migration using the bare form must not slip past the replay.
const NAME = String.raw`(?:"([^"]+)"|([a-zA-Z_]\w*))`;
const createRe = new RegExp(String.raw`create\s+policy\s+${NAME}\s+on\s+([\w."]+)([\s\S]*?);`, 'gi');
const dropRe = new RegExp(
  String.raw`drop\s+policy\s+(?:if\s+exists\s+)?${NAME}\s+on\s+([\w."]+)`,
  'gi',
);

const clean = (t: string) => t.replace(/"/g, '').replace(/^public\./, '');

// Every table declaring a session_id — the ones whose rows belong to one hunt
// and must therefore be reachable only by that hunt's members.
function sessionScopedTables(sql: string): Set<string> {
  const found = new Set<string>();
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?([\w.]+)\s*\(([\s\S]*?)\n\);/gi;
  for (const [, table, body] of sql.matchAll(re)) {
    if (/\bsession_id\b/i.test(body)) found.add(clean(table));
  }
  return found;
}

describe('permissive policy detection', () => {
  it('flags a policy that reads or writes without a membership check', () => {
    expect(isPermissive('for all using (true) with check (true)')).toBe(true);
    expect(isPermissive('for select using (true)')).toBe(true);
    // Reads by membership but accepts any write — still a way in.
    expect(isPermissive('for all using (public.is_member(session_id)) with check (true)')).toBe(true);
  });

  it('accepts a policy scoped to membership on both sides', () => {
    expect(
      isPermissive('for all using (public.is_member(session_id)) with check (public.is_member(session_id))'),
    ).toBe(false);
    expect(isPermissive('for select using (auth.uid() is not null)')).toBe(false);
  });
});

describe('row-level security ratchet', () => {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  const all = files.map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'));

  // Replay the migrations in order so a policy that was later dropped or
  // replaced doesn't count against the table that fixed it.
  const scoped = new Set<string>();
  const active = new Map<string, { table: string; permissive: boolean }>();

  for (const sql of all) {
    for (const t of sessionScopedTables(sql)) scoped.add(t);

    for (const [, quoted, bare, table] of sql.matchAll(dropRe)) {
      active.delete(`${clean(table)}::${quoted ?? bare}`);
    }

    for (const [, quoted, bare, table, body] of sql.matchAll(createRe)) {
      const t = clean(table);
      active.set(`${t}::${quoted ?? bare}`, { table: t, permissive: isPermissive(body) });
    }
  }

  it('finds the session-scoped tables it is meant to be guarding', () => {
    // If the CREATE TABLE parsing silently breaks, every assertion below
    // passes vacuously — so pin the tables we know are in there.
    expect(scoped).toContain('households');
    expect(scoped).toContain('session_users');
    expect(scoped).toContain('listing_reactions');
    expect(scoped).toContain('session_decisions');
  });

  it('leaves no session-scoped table reachable by anyone holding a session id', () => {
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
