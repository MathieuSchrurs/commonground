import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Postgres/Supabase RLS performance guidance: a bare `auth.uid()` inside a
// policy predicate (or a function a policy calls) gets re-evaluated once per
// row. Wrapping it as `(select auth.uid())` turns it into a one-time InitPlan,
// evaluated once per query instead. This statically replays
// `supabase/migrations/*.sql` in filename order — mirroring rls-ratchet.test.ts
// — so a policy or function that was later dropped/replaced doesn't count
// against whichever migration eventually wrapped it. Only the *final*
// effective body of each tracked function/policy is checked.

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

const clean = (t: string) => t.replace(/"/g, '').replace(/^public\./, '');

// Policy names may or may not be quoted; both forms are legal SQL.
const NAME = String.raw`(?:"([^"]+)"|([a-zA-Z_]\w*))`;
const createPolicyRe = new RegExp(String.raw`create\s+policy\s+${NAME}\s+on\s+([\w."]+)([\s\S]*?);`, 'gi');
const dropPolicyRe = new RegExp(
  String.raw`drop\s+policy\s+(?:if\s+exists\s+)?${NAME}\s+on\s+([\w."]+)`,
  'gi',
);

// `create or replace function <name>(...) ... as $$ <body> $$;` — each
// replace supersedes the prior body for that function name.
const functionRe = /create\s+or\s+replace\s+function\s+([\w.]+)\s*\([^)]*\)[\s\S]*?as\s+\$\$([\s\S]*?)\$\$;/gi;

// The only accepted form is `(select auth.uid())` (whitespace-insensitive).
// Strip every wrapped occurrence out, then anything left containing
// `auth.uid()` is a bare, unwrapped call.
const WRAPPED_AUTH_UID = /\(\s*select\s+auth\.uid\(\)\s*\)/gi;

function hasUnwrappedAuthUid(body: string): boolean {
  const withWrappedRemoved = body.replace(WRAPPED_AUTH_UID, '');
  return /auth\.uid\(\)/i.test(withWrappedRemoved);
}

describe('unwrapped auth.uid() detection', () => {
  it('flags a bare auth.uid() call', () => {
    expect(hasUnwrappedAuthUid('using (created_by = auth.uid())')).toBe(true);
  });

  it('accepts a wrapped auth.uid() call', () => {
    expect(hasUnwrappedAuthUid('using (created_by = (select auth.uid()))')).toBe(false);
  });

  it('accepts a wrapped call regardless of internal whitespace', () => {
    expect(hasUnwrappedAuthUid('using (created_by = ( select   auth.uid() ))')).toBe(false);
  });

  it('flags a bare call even alongside an unrelated wrapped one', () => {
    expect(
      hasUnwrappedAuthUid('using (a = (select auth.uid()) or b = auth.uid())'),
    ).toBe(true);
  });
});

describe('RLS auth.uid() is wrapped for one-time evaluation', () => {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  const all = files.map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'));

  // Replay function replacements in order — only the final body per name
  // matters. Keyed without the `public.` prefix, same as clean() everywhere
  // else here.
  const functions = new Map<string, string>();
  for (const sql of all) {
    for (const [, name, body] of sql.matchAll(functionRe)) {
      functions.set(clean(name), body);
    }
  }

  // Replay policy create/drop in order, same approach as rls-ratchet.test.ts.
  const policies = new Map<string, { table: string; body: string }>();
  for (const sql of all) {
    for (const [, quoted, bare, table] of sql.matchAll(dropPolicyRe)) {
      policies.delete(`${clean(table)}::${quoted ?? bare}`);
    }
    for (const [, quoted, bare, table, body] of sql.matchAll(createPolicyRe)) {
      const t = clean(table);
      policies.set(`${t}::${quoted ?? bare}`, { table: t, body });
    }
  }

  it('finds the tracked functions and policies it is meant to be guarding', () => {
    // Pins the parsing itself: if the regexes silently stop matching,
    // everything below passes vacuously.
    expect(functions.has('is_member')).toBe(true);
    expect(functions.has('is_creator')).toBe(true);
    expect(policies.has('sessions::Members read sessions')).toBe(true);
    expect(policies.has('sessions::Create own session')).toBe(true);
    expect(policies.has('sessions::Creator updates session')).toBe(true);
    expect(policies.has('sessions::Creator deletes session')).toBe(true);
    expect(policies.has('session_members::Add self as creator')).toBe(true);
    expect(policies.has('session_members::Remove self')).toBe(true);
    expect(policies.has('profiles::Profiles are readable')).toBe(true);
    expect(policies.has('profiles::Update own profile')).toBe(true);
  });

  it.each(['is_member', 'is_creator'])(
    'wraps auth.uid() inside %s',
    (name) => {
      const body = functions.get(name);
      expect(body).toBeDefined();
      expect(hasUnwrappedAuthUid(body ?? '')).toBe(false);
    },
  );

  it.each([
    'sessions::Members read sessions',
    'sessions::Create own session',
    'sessions::Creator updates session',
    'sessions::Creator deletes session',
    'session_members::Add self as creator',
    'session_members::Remove self',
    'profiles::Profiles are readable',
    'profiles::Update own profile',
  ])('wraps auth.uid() in the final "%s" policy', (key) => {
    const policy = policies.get(key);
    expect(policy).toBeDefined();
    expect(hasUnwrappedAuthUid(policy?.body ?? '')).toBe(false);
  });
});
