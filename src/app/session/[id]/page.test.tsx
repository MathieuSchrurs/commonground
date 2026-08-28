// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';

// The server now computes an updated participant's isochrone once and
// broadcasts it on `session_${sessionId}` (unit 2). This test is scoped to
// whether the page (a) stops refetching the isochrone itself on a constraint-changed
// `postgres_changes` UPDATE, and (b) applies the broadcast payload to the map
// instead. Every other card/component on the page is stubbed out.
const channelRegistry: Record<
  string,
  { postgresChanges?: (payload: unknown) => void; broadcast?: Record<string, (msg: unknown) => void> }
> = {};

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'session-1' }),
  useRouter: () => ({ push: () => {} }),
}));

vi.mock('@/utils/supabase/client', () => ({
  createClient: () => ({
    channel: (name: string) => {
      channelRegistry[name] ??= {};
      const chainable = {
        on: (type: string, config: { event: string }, callback: (arg: unknown) => void) => {
          if (type === 'postgres_changes') {
            channelRegistry[name].postgresChanges = callback;
          }
          if (type === 'broadcast') {
            channelRegistry[name].broadcast ??= {};
            channelRegistry[name].broadcast[config.event] = callback;
          }
          return chainable;
        },
        subscribe: () => ({ unsubscribe: () => {} }),
      };
      return chainable;
    },
    removeChannel: () => {},
  }),
}));

vi.mock('@/components/UserInputForm', () => ({ default: () => null }));
vi.mock('@/components/UserList', () => ({ default: () => null }));
vi.mock('@/components/ShortlistPanel', () => ({ default: () => null }));
vi.mock('@/components/ZoneLegend', () => ({ default: () => null }));

const { mapProps, householdsCardProps, sessionHeaderProps } = vi.hoisted(() => ({
  mapProps: { current: null as null | Record<string, unknown> },
  householdsCardProps: { current: null as null | Record<string, unknown> },
  sessionHeaderProps: { current: null as null | Record<string, unknown> },
}));

vi.mock('@/components/Map', () => ({
  default: (props: Record<string, unknown>) => {
    mapProps.current = props;
    return null;
  },
}));

vi.mock('@/components/HouseholdsCard', () => ({
  default: (props: Record<string, unknown>) => {
    householdsCardProps.current = props;
    return null;
  },
}));

vi.mock('@/components/SessionHeader', () => ({
  default: (props: Record<string, unknown>) => {
    sessionHeaderProps.current = props;
    return null;
  },
}));

let SessionPage: typeof import('./page').default;

const SESSION_ID = 'session-1';
const USER_1 = {
  id: 'u1',
  name: 'Anna',
  address: 'Korenmarkt 1, Gent',
  latitude: 51.05,
  longitude: 3.72,
  maxMinutes: 30,
  transportMode: 'driving',
};
const USER_2 = {
  id: 'u2',
  name: 'Bram',
  address: 'Vrijdagmarkt 1, Gent',
  latitude: 51.06,
  longitude: 3.73,
  maxMinutes: 45,
  transportMode: 'cycling',
};

function minimalFeatureCollection(marker: string) {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { marker },
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] },
      },
    ],
  };
}

beforeEach(async () => {
  for (const key of Object.keys(channelRegistry)) delete channelRegistry[key];
  mapProps.current = null;
  householdsCardProps.current = null;
  sessionHeaderProps.current = null;
  // The page snapshots the previous visit from localStorage in a mount
  // effect; this jsdom environment doesn't expose it, so stub the surface
  // the page uses.
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });
  SessionPage = (await import('./page')).default;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('SessionPage — isochrone updates arrive via broadcast, not client refetch', () => {
  it('applies a broadcast isochrone-update to the map without refetching /api/isochrone', async () => {
    const isochroneSpy = vi.fn(async () => ({
      ok: true,
      json: async () => minimalFeatureCollection('initial'),
    }));

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/me')) {
          return { ok: true, json: async () => ({ participant: { id: 'me' } }) };
        }
        if (url === `/api/sessions/${SESSION_ID}/bootstrap`) {
          // Initial isochrone areas arrive inside the bootstrap payload, so
          // the page never has to POST /api/isochrone on first paint.
          return {
            ok: true,
            json: async () => ({
              participants: [USER_1, USER_2],
              bufferPct: 0,
              isochrones: [
                minimalFeatureCollection('initial').features[0],
                minimalFeatureCollection('initial').features[0],
              ],
              intersection: minimalFeatureCollection('initial'),
              areaKm2: 1,
              bufferedIntersection: minimalFeatureCollection('initial'),
              bufferedAreaKm2: 1,
              listings: [],
            }),
          };
        }
        if (url === '/api/isochrone') {
          return isochroneSpy();
        }
        if (url === '/api/intersection') {
          return { ok: true, json: async () => ({}) };
        }
        return { ok: true, json: async () => ({}) };
      })
    );

    render(<SessionPage />);

    await waitFor(() => {
      expect(mapProps.current?.isochrones).toBeDefined();
      expect((mapProps.current!.isochrones as unknown[]).length).toBe(2);
    });

    const callsBefore = isochroneSpy.mock.calls.length;
    // The bootstrap payload supplied both areas — the page must not have
    // re-fetched them per participant on first paint.
    expect(callsBefore).toBe(0);

    const channel = channelRegistry[`session_${SESSION_ID}`];
    expect(channel?.postgresChanges).toBeDefined();

    await channel.postgresChanges!({
      eventType: 'UPDATE',
      new: {
        id: 'u1',
        name: 'Anna',
        address: 'New Address 5, Gent',
        latitude: 52.0,
        longitude: 4.0,
        max_minutes: 30,
        transport_mode: 'driving',
      },
    });

    await waitFor(() => {
      expect(isochroneSpy.mock.calls.length).toBe(callsBefore);
    });

    expect(channel.broadcast?.['isochrone-update']).toBeDefined();

    const distinguishingFeature = {
      type: 'Feature',
      properties: { marker: 'from-broadcast' },
      geometry: { type: 'Polygon', coordinates: [[[9, 9], [9, 10], [10, 10], [9, 9]]] },
    };

    await channel.broadcast!['isochrone-update']({
      event: 'isochrone-update',
      type: 'broadcast',
      payload: { userId: 'u1', isochrone: distinguishingFeature },
    });

    await waitFor(() => {
      const isochrones = mapProps.current!.isochrones as Array<{ properties?: { marker?: string } }>;
      expect(isochrones[0]?.properties?.marker).toBe('from-broadcast');
    });
    // u2 (index 1) never appeared in the broadcast payload — asserting it's
    // untouched rules out an implementation that just overwrites index 0
    // rather than matching by userId.
    const isochrones = mapProps.current!.isochrones as Array<{ properties?: { marker?: string } }>;
    expect(isochrones[1]?.properties?.marker).toBe('initial');
  });
});

describe('SessionPage — toggling a reaction does not double-fetch reactions', () => {
  it('refetches reactions once for the realtime echo, not once for the toggle plus once for the echo', async () => {
    let reactionsFetchCount = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options?: { method?: string }) => {
        if (url.endsWith('/me')) {
          return { ok: true, json: async () => ({ participant: { id: 'me' } }) };
        }
        if (url === `/api/sessions/${SESSION_ID}/bootstrap`) {
          return {
            ok: true,
            json: async () => ({
              name: null,
              participants: [USER_1],
              bufferPct: 0,
              isochrones: [],
              intersection: null,
              areaKm2: null,
              bufferedIntersection: null,
              bufferedAreaKm2: null,
              listings: [],
            }),
          };
        }
        if (url === `/api/sessions/${SESSION_ID}`) {
          return { ok: true, json: async () => ({ users: [USER_1], session: {} }) };
        }
        if (url === `/api/sessions/${SESSION_ID}/households`) {
          return { ok: true, json: async () => ({ households: [] }) };
        }
        if (url === `/api/sessions/${SESSION_ID}/reactions`) {
          if (options?.method === 'POST') {
            return { ok: true, json: async () => ({}) };
          }
          reactionsFetchCount += 1;
          return { ok: true, json: async () => ({ reactions: [] }) };
        }
        if (url === '/api/isochrone') {
          return { ok: true, json: async () => minimalFeatureCollection('initial') };
        }
        if (url === '/api/intersection') {
          return { ok: true, json: async () => ({}) };
        }
        return { ok: true, json: async () => ({}) };
      })
    );

    render(<SessionPage />);

    // Initial mount triggers loadReactions() once, independently of the
    // toggle under test.
    await waitFor(() => {
      expect(reactionsFetchCount).toBe(1);
    });

    // "Who am I" must have resolved before a toggle is possible.
    await waitFor(() => {
      expect(mapProps.current?.myUserId).toBe('me');
    });

    expect(mapProps.current?.onToggleReaction).toBeDefined();

    await (mapProps.current!.onToggleReaction as (
      listingId: string,
      reaction: string
    ) => Promise<void>)('listing-1', 'love');

    const channel = channelRegistry[`reactions_${SESSION_ID}`];
    expect(channel?.postgresChanges).toBeDefined();

    // Simulate the realtime echo of the toggle's own write arriving.
    await channel.postgresChanges!({ eventType: 'UPDATE' });

    await waitFor(() => {
      expect(reactionsFetchCount).toBe(2);
    });

    // Give any stray in-flight fetch time to land — this is what catches a
    // direct loadReactions() call from the toggle handler racing the echo
    // and pushing the count to 3.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(reactionsFetchCount).toBe(2);
  });
});

describe('SessionPage — loading households and users runs concurrently', () => {
  it('has the households fetch and the session fetch in flight at the same time', async () => {
    const HOUSEHOLDS_URL = `/api/sessions/${SESSION_ID}/households`;
    const SESSION_URL = `/api/sessions/${SESSION_ID}`;
    const inFlight = new Set<string>();
    let overlapObserved = false;

    async function trackOverlap(url: string, other: string, respond: () => unknown) {
      inFlight.add(url);
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (inFlight.has(other)) overlapObserved = true;
      inFlight.delete(url);
      return { ok: true, json: async () => respond() };
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/me')) {
          return { ok: true, json: async () => ({ participant: { id: 'me' } }) };
        }
        if (url === `/api/sessions/${SESSION_ID}/bootstrap`) {
          return {
            ok: true,
            json: async () => ({
              name: null,
              participants: [USER_1],
              bufferPct: 0,
              isochrones: [],
              intersection: null,
              areaKm2: null,
              bufferedIntersection: null,
              bufferedAreaKm2: null,
              listings: [],
            }),
          };
        }
        if (url === HOUSEHOLDS_URL) {
          return trackOverlap(HOUSEHOLDS_URL, SESSION_URL, () => ({ households: [] }));
        }
        if (url === SESSION_URL) {
          return trackOverlap(SESSION_URL, HOUSEHOLDS_URL, () => ({ users: [USER_1], session: {} }));
        }
        if (url === '/api/isochrone') {
          return { ok: true, json: async () => minimalFeatureCollection('initial') };
        }
        if (url === '/api/intersection') {
          return { ok: true, json: async () => ({}) };
        }
        return { ok: true, json: async () => ({}) };
      })
    );

    render(<SessionPage />);

    await waitFor(() => {
      expect(mapProps.current?.isochrones).toBeDefined();
    });
    expect(householdsCardProps.current?.onChanged).toBeDefined();

    // Let the mount-time fetches (which fire from independent effects and so
    // overlap regardless of this unit's fix) fully drain before measuring —
    // the assertion below must be about the two fetches triggered together
    // from a single loadUsersAndHouseholds() call, not about unrelated
    // effects that happened to race each other on mount.
    await new Promise((resolve) => setTimeout(resolve, 50));
    overlapObserved = false;

    await (householdsCardProps.current!.onChanged as () => Promise<void>)();

    expect(overlapObserved).toBe(true);
  });
});

describe('SessionPage — passes the fetched session name to SessionHeader', () => {
  it('threads name from the bootstrap payload into SessionHeader, without a dedicated fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/me')) {
          return { ok: true, json: async () => ({ participant: { id: 'me' } }) };
        }
        if (url === `/api/sessions/${SESSION_ID}/bootstrap`) {
          return {
            ok: true,
            json: async () => ({
              name: 'My Hunt',
              participants: [USER_1],
              bufferPct: 0,
              isochrones: [],
              intersection: null,
              areaKm2: null,
              bufferedIntersection: null,
              bufferedAreaKm2: null,
              listings: [],
            }),
          };
        }
        if (url === `/api/sessions/${SESSION_ID}/households`) {
          return { ok: true, json: async () => ({ households: [] }) };
        }
        if (url === '/api/isochrone') {
          return { ok: true, json: async () => minimalFeatureCollection('initial') };
        }
        if (url === '/api/intersection') {
          return { ok: true, json: async () => ({}) };
        }
        return { ok: true, json: async () => ({}) };
      })
    );

    render(<SessionPage />);

    await waitFor(() => {
      expect(sessionHeaderProps.current?.name).toBe('My Hunt');
    });
    expect(sessionHeaderProps.current?.sessionId).toBe(SESSION_ID);
  });
});
