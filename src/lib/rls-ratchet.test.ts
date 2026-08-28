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
// nothing later tightens. The list is empty as of 20260813 — every
// session-scoped table is membership-scoped. It may never grow: a new table
// that needs an exception needs a reason, in writing, here.
const KNOWN_OPEN = new Set<string>();

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

// `USING (true)` lets anyone read and `WITH CHECK (true)` lets anyone write, so
// either one alone leaves the table open — a policy reading rows by membership
// but accepting any insert is still a way into someone else's session.
function isPermissive(body: string): boolean {
  return /\busing\s*\(\s*true\s*\)/i.test(body) || /\bwith\s+check\s*\(\s*true\s*\)/i.test(body);
}

// Postgres defaults an unqualified CREATE POLICY to FOR ALL, so a missing
// FOR clause must read as ALL rather than as "no operation".
function operationOf(body: string): 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' {
  const m = /\bfor\s+(all|select|insert|update|delete)\b/i.exec(body);
  return (m ? m[1].toUpperCase() : 'ALL') as 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
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

  it('reads the operation a policy applies to', () => {
    expect(operationOf('for all using (true) with check (true)')).toBe('ALL');
    expect(operationOf('for select using (true)')).toBe('SELECT');
    expect(operationOf('for insert with check (true)')).toBe('INSERT');
    expect(operationOf('for update using (true) with check (true)')).toBe('UPDATE');
    expect(operationOf('for delete using (true)')).toBe('DELETE');
    // Postgres treats an unqualified policy as FOR ALL.
    expect(operationOf('using (true) with check (true)')).toBe('ALL');
  });
});

describe('row-level security ratchet', () => {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  const all = files.map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'));

  // Replay the migrations in order so a policy that was later dropped or
  // replaced doesn't count against the table that fixed it.
  const scoped = new Set<string>();
  const active = new Map<
    string,
    { table: string; permissive: boolean; operation: ReturnType<typeof operationOf> }
  >();

  for (const sql of all) {
    for (const t of sessionScopedTables(sql)) scoped.add(t);

    for (const [, quoted, bare, table] of sql.matchAll(dropRe)) {
      active.delete(`${clean(table)}::${quoted ?? bare}`);
    }

    for (const [, quoted, bare, table, body] of sql.matchAll(createRe)) {
      const t = clean(table);
      active.set(`${t}::${quoted ?? bare}`, {
        table: t,
        permissive: isPermissive(body),
        operation: operationOf(body),
      });
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

  it('has no exceptions left to justify', () => {
    // Every entry here is a session-scoped table anyone can read and write.
    // Empty is the goal state; a new entry needs a written reason above.
    expect([...KNOWN_OPEN]).toEqual([]);

    // And nothing may be listed that is already tightened — a stale exception
    // would silently re-open a table the day someone loosened it again.
    const stillOpen = new Set(
      [...active.values()].filter((p) => p.permissive && scoped.has(p.table)).map((p) => p.table),
    );
    for (const table of KNOWN_OPEN) expect(stillOpen).toContain(table);
  });

  // property_listings is a shared pool with no session_id, so it's outside
  // sessionScopedTables() and the checks above — but a permissive write
  // policy there (FOR ALL/INSERT/UPDATE/DELETE USING/CHECK (true)) would
  // still let anyone insert, update or delete any listing. Public read
  // (FOR SELECT USING (true)) is intentional and must not be flagged.
  it('leaves no write-permissive policy active on property_listings', () => {
    const writeOpen = [...active.values()]
      .filter((p) => p.table === 'property_listings' && p.permissive && p.operation !== 'SELECT')
      .map((p) => p.operation);

    expect(writeOpen).toEqual([]);
  });
});
