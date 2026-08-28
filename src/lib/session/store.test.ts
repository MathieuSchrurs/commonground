import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@/utils/supabase/server';
import { createFakeSupabaseClient } from './testSupabase';

vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn() }));

// Imported after the mock, same reason as route.test.ts's sibling mocks: the
// store must pick up the mocked createClient, not the real one (which reads
// NEXT_PUBLIC_SUPABASE_* at import time).
import { createFolder, listSessionsForAccount, renameSession, setSearchBufferPct, toggleReaction } from './store';
import { Invalid, NotFound } from './errors';

const mockedCreateClient = vi.mocked(createClient);

describe('toggleReaction', () => {
  beforeEach(() => {
    mockedCreateClient.mockReset();
  });

  it('adds or replaces a reaction with a single call to the toggle_reaction RPC, never touching listing_reactions directly', async () => {
    const row = {
      id: 'reaction-1',
      session_id: 'session-1',
      listing_id: 'listing-1',
      user_id: 'user-1',
      reaction: 'love',
    };
    const fake = createFakeSupabaseClient({ rpcResult: { data: [row], error: null } });
    mockedCreateClient.mockResolvedValue(fake as never);

    const result = await toggleReaction('session-1', 'listing-1', 'user-1', 'love');

    expect(fake.rpc).toHaveBeenCalledTimes(1);
    expect(fake.rpc).toHaveBeenCalledWith('toggle_reaction', {
      p_session_id: 'session-1',
      p_listing_id: 'listing-1',
      p_user_id: 'user-1',
      p_reaction: 'love',
    });
    expect(fake.from).not.toHaveBeenCalledWith('listing_reactions');
    expect(result).toEqual(row);
  });

  it('returns null, without touching listing_reactions, when the RPC toggles the reaction off', async () => {
    const fake = createFakeSupabaseClient({ rpcResult: { data: [], error: null } });
    mockedCreateClient.mockResolvedValue(fake as never);

    const result = await toggleReaction('session-1', 'listing-1', 'user-1', 'love');

    expect(fake.rpc).toHaveBeenCalledTimes(1);
    expect(fake.from).not.toHaveBeenCalledWith('listing_reactions');
    expect(result).toBeNull();
  });

  it('rejects an unknown reaction kind before ever calling the RPC', async () => {
    const fake = createFakeSupabaseClient();
    mockedCreateClient.mockResolvedValue(fake as never);

    await expect(
      toggleReaction('session-1', 'listing-1', 'user-1', 'like' as never),
    ).rejects.toThrow(Invalid);
    expect(fake.rpc).not.toHaveBeenCalled();
  });
});

describe('listSessionsForAccount', () => {
  beforeEach(() => {
    mockedCreateClient.mockReset();
  });

  it('fetches every session in a single call to the list_sessions_for_account RPC, never touching session_members, sessions or profiles directly', async () => {
    const rows = [
      {
        id: 'session-1',
        name: 'Session One',
        updated_at: '2026-08-01T00:00:00.000Z',
        role: 'owner',
        members: [{ id: 'account-1', name: 'Ada' }],
      },
      {
        id: 'session-2',
        name: 'Session Two',
        updated_at: '2026-08-20T00:00:00.000Z',
        role: 'member',
        members: [
          { id: 'account-1', name: 'Ada' },
          { id: 'account-2', name: null },
        ],
      },
    ];
    const fake = createFakeSupabaseClient({ rpcResult: { data: rows, error: null } });
    mockedCreateClient.mockResolvedValue(fake as never);

    const result = await listSessionsForAccount('account-1');

    expect(fake.rpc).toHaveBeenCalledTimes(1);
    expect(fake.rpc).toHaveBeenCalledWith('list_sessions_for_account', {
      p_account_id: 'account-1',
    });
    expect(fake.from).not.toHaveBeenCalledWith('session_members');
    expect(fake.from).not.toHaveBeenCalledWith('sessions');
    expect(fake.from).not.toHaveBeenCalledWith('profiles');

    // Newest updatedAt first, even though the RPC returned oldest first.
    expect(result).toEqual([
      {
        id: 'session-2',
        name: 'Session Two',
        role: 'member',
        members: [
          { id: 'account-1', name: 'Ada' },
          { id: 'account-2', name: null },
        ],
        updatedAt: '2026-08-20T00:00:00.000Z',
      },
      {
        id: 'session-1',
        name: 'Session One',
        role: 'owner',
        members: [{ id: 'account-1', name: 'Ada' }],
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ]);
  });

  it('returns an empty array when the account has no sessions, without erroring', async () => {
    const fake = createFakeSupabaseClient({ rpcResult: { data: [], error: null } });
    mockedCreateClient.mockResolvedValue(fake as never);

    const result = await listSessionsForAccount('account-1');

    expect(result).toEqual([]);
    expect(fake.rpc).toHaveBeenCalledTimes(1);
  });
});

describe('renameSession', () => {
  beforeEach(() => {
    mockedCreateClient.mockReset();
  });

  it('renames with a single query against sessions, never touching session_members', async () => {
    const row = {
      id: 'session-1',
      name: 'New Name',
      created_by: 'account-1',
      search_buffer_pct: 5,
    };
    const fake = createFakeSupabaseClient({ fromResult: { data: row, error: null } });
    mockedCreateClient.mockResolvedValue(fake as never);

    const result = await renameSession('session-1', 'account-1', 'New Name');

    expect(fake.from).toHaveBeenCalledTimes(1);
    expect(fake.from).toHaveBeenCalledWith('sessions');
    expect(fake.from).not.toHaveBeenCalledWith('session_members');
    expect(result).toEqual(row);
  });

  it('throws NotFound (not a raw PostgREST error) when a member who is not the creator has their update refused by RLS', async () => {
    // The old pre-check tested membership, not creator-ship: a non-creator
    // member has a session_members row, so that check would have passed —
    // but the update's RLS ("Creator updates session") matches zero rows.
    const fake = createFakeSupabaseClient({
      fromResultsByTable: {
        session_members: { data: { account_id: 'account-2' }, error: null },
        sessions: { data: null, error: null },
      },
    });
    mockedCreateClient.mockResolvedValue(fake as never);

    let caught: unknown;
    try {
      await renameSession('session-1', 'account-2', 'New Name');
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(NotFound);
    expect((caught as NotFound).name).toBe('NotFound');
  });
});

describe('setSearchBufferPct', () => {
  beforeEach(() => {
    mockedCreateClient.mockReset();
  });

  it('updates with a single query against sessions, never touching session_members', async () => {
    const row = {
      id: 'session-1',
      name: 'Session One',
      created_by: 'account-1',
      search_buffer_pct: 10,
    };
    const fake = createFakeSupabaseClient({ fromResult: { data: row, error: null } });
    mockedCreateClient.mockResolvedValue(fake as never);

    const result = await setSearchBufferPct('session-1', 'account-1', 10);

    expect(fake.from).toHaveBeenCalledTimes(1);
    expect(fake.from).toHaveBeenCalledWith('sessions');
    expect(fake.from).not.toHaveBeenCalledWith('session_members');
    expect(result).toEqual(row);
  });

  it('throws NotFound (not a raw PostgREST error) when a member who is not the creator has their update refused by RLS', async () => {
    // Same case as renameSession: membership exists, so the old pre-check
    // would have passed, but the update's RLS matches zero rows.
    const fake = createFakeSupabaseClient({
      fromResultsByTable: {
        session_members: { data: { account_id: 'account-2' }, error: null },
        sessions: { data: null, error: null },
      },
    });
    mockedCreateClient.mockResolvedValue(fake as never);

    let caught: unknown;
    try {
      await setSearchBufferPct('session-1', 'account-2', 10);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(NotFound);
    expect((caught as NotFound).name).toBe('NotFound');
  });
});

describe('createFolder', () => {
  beforeEach(() => {
    mockedCreateClient.mockReset();
  });

  it('validates a supplied parent with a narrow id/parent_id select, not select(*)', async () => {
    const fake = createFakeSupabaseClient({
      fromResultsByTable: {
        session_folders: [
          { data: [{ id: 'parent-1', parent_id: null }], error: null },
          {
            data: { id: 'new-folder', session_id: 'session-1', name: 'Photos', parent_id: 'parent-1' },
            error: null,
          },
        ],
      },
    });
    mockedCreateClient.mockResolvedValue(fake as never);

    await createFolder('session-1', 'Photos', 'parent-1');

    const folderQueries = fake.queries.filter((q) => q.table === 'session_folders');
    const validationSelect = folderQueries[0].calls.find((c) => c.method === 'select');
    expect(validationSelect?.args).toEqual(['id, parent_id']);
  });

  it('creates a folder under a valid, shallow-enough parent', async () => {
    const newFolder = { id: 'new-folder', session_id: 'session-1', name: 'Photos', parent_id: 'parent-1' };
    const fake = createFakeSupabaseClient({
      fromResultsByTable: {
        session_folders: [
          { data: [{ id: 'parent-1', parent_id: null }], error: null },
          { data: newFolder, error: null },
        ],
      },
    });
    mockedCreateClient.mockResolvedValue(fake as never);

    const result = await createFolder('session-1', 'Photos', 'parent-1');

    expect(result).toEqual(newFolder);
  });

  it('throws NotFound when the supplied parentId does not exist', async () => {
    const fake = createFakeSupabaseClient({
      fromResultsByTable: {
        session_folders: [{ data: [], error: null }],
      },
    });
    mockedCreateClient.mockResolvedValue(fake as never);

    await expect(createFolder('session-1', 'Photos', 'missing-parent')).rejects.toThrow(NotFound);
  });

  it('throws Invalid when the parent is already at MAX_FOLDER_DEPTH', async () => {
    const fake = createFakeSupabaseClient({
      fromResultsByTable: {
        session_folders: [
          {
            data: [
              { id: 'level1', parent_id: null },
              { id: 'level2', parent_id: 'level1' },
              { id: 'level3', parent_id: 'level2' },
            ],
            error: null,
          },
        ],
      },
    });
    mockedCreateClient.mockResolvedValue(fake as never);

    await expect(createFolder('session-1', 'Photos', 'level3')).rejects.toThrow(Invalid);
  });
});
