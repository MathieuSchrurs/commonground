import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@/utils/supabase/server';
import { createFakeSupabaseClient } from './testSupabase';

vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn() }));

// Imported after the mock, same reason as route.test.ts's sibling mocks: the
// store must pick up the mocked createClient, not the real one (which reads
// NEXT_PUBLIC_SUPABASE_* at import time).
import { toggleReaction } from './store';
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
