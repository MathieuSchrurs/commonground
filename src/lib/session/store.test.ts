import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@/utils/supabase/server';
import { createFakeSupabaseClient } from './testSupabase';

vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn() }));

// Imported after the mock, same reason as route.test.ts's sibling mocks: the
// store must pick up the mocked createClient, not the real one (which reads
// NEXT_PUBLIC_SUPABASE_* at import time).
import { listSessionsForAccount, toggleReaction } from './store';
import { Invalid } from './errors';

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
