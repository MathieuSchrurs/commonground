// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';

// Every dashboard card is a heavy component in its own right (file management,
// meeting scheduling, todos...) with its own coverage concerns. This test is
// scoped to one thing: whether the dashboard actually applies the viewer's
// hide-commercial preference to `houseOptions`, the gap a second-pass review
// found (a participant hiding commercial listings still saw them in the
// file-attachment picker). Every card is stubbed to a prop-capturing spy so
// none of their own rendering/fetching is exercised here.
const { sharedFilesCardProps, sessionHeaderProps } = vi.hoisted(() => ({
  sharedFilesCardProps: { current: null as null | Record<string, unknown> },
  sessionHeaderProps: { current: null as null | Record<string, unknown> },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'session-1' }),
}));

vi.mock('@/utils/supabase/client', () => {
  const chainable: { on: () => typeof chainable; subscribe: () => { unsubscribe: () => void } } = {
    on: () => chainable,
    subscribe: () => ({ unsubscribe: () => {} }),
  };
  return {
    createClient: () => ({
      channel: () => chainable,
      removeChannel: () => {},
    }),
  };
});

vi.mock('@/components/SessionHeader', () => ({
  default: (props: Record<string, unknown>) => {
    sessionHeaderProps.current = props;
    return null;
  },
}));
vi.mock('@/components/dashboard/NextMeetingCard', () => ({ default: () => null }));
vi.mock('@/components/dashboard/GroupFavoritesCard', () => ({ default: () => null }));
vi.mock('@/components/dashboard/SplitVotesCard', () => ({ default: () => null }));
vi.mock('@/components/dashboard/TodosCard', () => ({ default: () => null }));
vi.mock('@/components/dashboard/DecisionsCard', () => ({ default: () => null }));
vi.mock('@/components/dashboard/NeedsYouCard', () => ({ default: () => null }));
vi.mock('@/components/dashboard/SharedFilesCard', () => ({
  default: (props: Record<string, unknown>) => {
    sharedFilesCardProps.current = props;
    return null;
  },
}));

let DashboardPage: typeof import('./page').default;

beforeEach(async () => {
  sharedFilesCardProps.current = null;
  sessionHeaderProps.current = null;
  DashboardPage = (await import('./page')).default;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body };
}

describe('DashboardPage — houseOptions respects the hide-commercial preference', () => {
  it('excludes a commercial listing from houseOptions when the viewer hides commercial listings', async () => {
    const engaged = [
      { listing: { id: 'office-1', property_type: 'commercial', address: 'Office St 1' }, standings: [], yesCount: 0, unanimous: false },
      { listing: { id: 'house-1', property_type: 'house', address: 'House St 1' }, standings: [], yesCount: 0, unanimous: false },
    ];

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/me')) return jsonResponse({ participant: { id: 'me', hideCommercial: true } });
      if (url.endsWith('/convergence')) return jsonResponse({ engaged, considered: [], favorites: [], contested: [] });
      // Every other endpoint (users, meeting, files, folders, meeting-items, todos, decisions):
      // an empty, shape-appropriate body is enough — this test doesn't exercise them.
      return jsonResponse({});
    }));

    render(<DashboardPage />);

    await waitFor(() => expect(sharedFilesCardProps.current?.houseOptions).toBeDefined());
    const houseOptions = sharedFilesCardProps.current!.houseOptions as { id: string }[];

    expect(houseOptions.map((h) => h.id)).toEqual(['house-1']);
  });

  it('includes a commercial listing in houseOptions when the viewer has not hidden it', async () => {
    const engaged = [
      { listing: { id: 'office-1', property_type: 'commercial', address: 'Office St 1' }, standings: [], yesCount: 0, unanimous: false },
    ];

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/me')) return jsonResponse({ participant: { id: 'me', hideCommercial: false } });
      if (url.endsWith('/convergence')) return jsonResponse({ engaged, considered: [], favorites: [], contested: [] });
      return jsonResponse({});
    }));

    render(<DashboardPage />);

    await waitFor(() => expect(sharedFilesCardProps.current?.houseOptions).toBeDefined());
    const houseOptions = sharedFilesCardProps.current!.houseOptions as { id: string }[];

    expect(houseOptions.map((h) => h.id)).toEqual(['office-1']);
  });
});

describe('DashboardPage — passes the fetched session name to SessionHeader', () => {
  it('threads session.name from the existing /api/sessions/:id fetch into SessionHeader, without a dedicated fetch', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/me')) return jsonResponse({ participant: { id: 'me' } });
      if (url.endsWith('/convergence')) return jsonResponse({ engaged: [], considered: [], favorites: [], contested: [] });
      if (url === '/api/sessions/session-1') return jsonResponse({ users: [], session: { name: 'My Hunt' } });
      return jsonResponse({});
    }));

    render(<DashboardPage />);

    await waitFor(() => expect(sessionHeaderProps.current?.name).toBe('My Hunt'));
    expect(sessionHeaderProps.current?.sessionId).toBe('session-1');
  });
});
