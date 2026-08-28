// A minimal fake Supabase client for tests that mock `@/utils/supabase/server`.
// No existing test in the repo needed to do this before issue #43 (round-trip
// collapse in the session store): most of the store's callers went through
// route.test.ts's HTTP seam instead. Once `toggleReaction` and its siblings
// call `db.rpc(...)` directly, tests need a client to hand back from a mocked
// `createClient()` — this is that client, kept in one place so the other units
// of #43 (listSessionsForAccount, renameSession/setSearchBufferPct,
// createFolder) can reuse it instead of hand-rolling their own.
//
// Deliberately not `*.test.ts`: vitest's `include` in vitest.config.ts only
// picks up `src/**/*.test.ts(x)`, so this file is never itself collected and
// run as a (empty) test suite.
import { vi } from 'vitest';

export type FakeResult<T = unknown> = { data: T | null; error: unknown };

// One `.from(table)` call and everything chained off it, recorded so a test
// can assert a table was never touched at all, or inspect exactly which
// filters were applied.
export interface RecordedQuery {
  table: string;
  calls: { method: string; args: unknown[] }[];
}

export interface FakeSupabaseClient {
  rpc: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
  queries: RecordedQuery[];
}

const CHAINABLE_METHODS = ['select', 'eq', 'in', 'update', 'upsert', 'delete', 'insert'] as const;

// Builds a fake client whose `.rpc()` resolves with `rpcResult`, and whose
// `.from(table)` returns a chain that records every call it receives and
// resolves (via `.single()`, `.maybeSingle()`, or by being awaited directly)
// with `fromResult`. Enough surface for the store's current
// `from().select().eq()...` chains — extend `CHAINABLE_METHODS` if a later
// unit's chain needs a method this doesn't have yet.
export function createFakeSupabaseClient(options?: {
  rpcResult?: FakeResult;
  fromResult?: FakeResult;
  // Per-table override of `fromResult`, for a test where two different
  // tables in the same call need to resolve differently (e.g. a membership
  // row exists but an update matches none) — falls back to `fromResult` for
  // any table not listed here. An array lets successive `.from(table)` calls
  // against the *same* table resolve differently in turn (e.g. a
  // parent-validation lookup followed by the insert), holding on the last
  // entry once exhausted.
  fromResultsByTable?: Record<string, FakeResult | FakeResult[]>;
}): FakeSupabaseClient {
  const rpcResult = options?.rpcResult ?? { data: null, error: null };
  const fromResult = options?.fromResult ?? { data: null, error: null };
  const fromResultsByTable = options?.fromResultsByTable ?? {};
  const tableCallCounts: Record<string, number> = {};
  const queries: RecordedQuery[] = [];

  const rpc = vi.fn().mockResolvedValue(rpcResult);

  function makeChain(table: string) {
    const record: RecordedQuery = { table, calls: [] };
    queries.push(record);
    const configured = fromResultsByTable[table];
    let tableResult: FakeResult;
    if (Array.isArray(configured)) {
      const callIndex = tableCallCounts[table] ?? 0;
      tableCallCounts[table] = callIndex + 1;
      tableResult = configured[Math.min(callIndex, configured.length - 1)];
    } else {
      tableResult = configured ?? fromResult;
    }

    const chain: Record<string, unknown> = {};
    for (const method of CHAINABLE_METHODS) {
      chain[method] = (...args: unknown[]) => {
        record.calls.push({ method, args });
        return chain;
      };
    }
    chain.single = (...args: unknown[]) => {
      record.calls.push({ method: 'single', args });
      return Promise.resolve(tableResult);
    };
    chain.maybeSingle = (...args: unknown[]) => {
      record.calls.push({ method: 'maybeSingle', args });
      return Promise.resolve(tableResult);
    };
    // Some real chains (e.g. `.delete().eq(...)`) resolve without a terminal
    // `.single()`/`.maybeSingle()` call — make the chain itself thenable so
    // `await`-ing it directly also works.
    (chain as unknown as { then: PromiseLike<FakeResult>['then'] }).then = (resolve) =>
      Promise.resolve(tableResult).then(resolve as never);

    return chain;
  }

  const from = vi.fn((table: string) => makeChain(table));

  return { rpc, from, queries };
}
