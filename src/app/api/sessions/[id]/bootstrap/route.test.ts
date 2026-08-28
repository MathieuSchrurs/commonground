import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSession, listUsers } from '@/lib/session/store';
import { getIsochrone } from '@/lib/mapbox';
import { computeIntersectionResult } from '@/lib/intersection';
import { fetchListingsInPolygon } from '@/scraper/db';
import { NotFound } from '@/lib/session/errors';

vi.mock('@/lib/session/store', () => ({
  getSession: vi.fn(),
  listUsers: vi.fn(),
}));
vi.mock('@/lib/mapbox', () => ({
  getIsochrone: vi.fn(),
}));
vi.mock('@/lib/intersection', () => ({
  computeIntersectionResult: vi.fn(),
}));
vi.mock('@/scraper/db', () => ({
  fetchListingsInPolygon: vi.fn(),
}));

// GET is imported after the mocks, matching this repo's convention for
// testing a route handler directly rather than through a server.
import { GET } from './route';

const mockedGetSession = vi.mocked(getSession);
const mockedListUsers = vi.mocked(listUsers);
const mockedGetIsochrone = vi.mocked(getIsochrone);
const mockedComputeIntersectionResult = vi.mocked(computeIntersectionResult);
const mockedFetchListingsInPolygon = vi.mocked(fetchListingsInPolygon);

function ctxWithId(id: string) {
  return { params: Promise.resolve({ id }) } as never;
}

const req = {} as never;

const SESSION = { id: 's1', name: 'Home hunt', created_by: 'a1', search_buffer_pct: 10 };

const CONSTRAINT = {
  id: 'u1',
  name: 'Anna',
  address: 'Korenmarkt 1, Gent',
  latitude: 51.05,
  longitude: 3.72,
  maxMinutes: 30,
  transportMode: 'driving' as const,
};

function feature(marker: string) {
  return {
    type: 'Feature' as const,
    properties: { marker },
    geometry: {
      type: 'Polygon' as const,
      coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetSession.mockResolvedValue(SESSION as never);
  mockedListUsers.mockResolvedValue([CONSTRAINT]);
  mockedGetIsochrone.mockResolvedValue({
    type: 'FeatureCollection',
    features: [feature('u1')],
  } as never);
  mockedFetchListingsInPolygon.mockResolvedValue({
    listings: [{ source: 'realo', external_id: '1', url: 'https://example.com/1', id: 'l1' }],
    stats: { bboxListings: 1, insidePolygon: 1, mergedDuplicates: 0 },
  });
  mockedComputeIntersectionResult.mockReturnValue({
    intersection: feature('strict'),
    areaKm2: 12.3,
    bufferedIntersection: feature('buffered'),
    bufferedAreaKm2: 18.4,
  } as never);
});

describe('GET /api/sessions/[id]/bootstrap', () => {
  it('returns the session, its participants, their isochrone areas, the common ground and the listings in one payload', async () => {
    const res = await GET(req, ctxWithId('s1'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      name: 'Home hunt',
      bufferPct: 10,
      participants: [CONSTRAINT],
      isochrones: [feature('u1')],
      intersection: feature('strict'),
      areaKm2: 12.3,
      bufferedIntersection: feature('buffered'),
      bufferedAreaKm2: 18.4,
      listings: [{ source: 'realo', external_id: '1', url: 'https://example.com/1', id: 'l1' }],
    });

    // The listings query runs against the area the page will actually draw:
    // the buffered common ground.
    expect(mockedFetchListingsInPolygon).toHaveBeenCalledWith(feature('buffered'));
    // Isochrone areas are unwrapped to the features the client stores.
    expect(mockedGetIsochrone).toHaveBeenCalledWith({
      lat: 51.05,
      lng: 3.72,
      minutes: 30,
      mode: 'driving',
    });
  });

  it('clamps the persisted search buffer to the slider range', async () => {
    mockedGetSession.mockResolvedValue({ ...SESSION, search_buffer_pct: 99 } as never);

    await GET(req, ctxWithId('s1'));

    expect(mockedComputeIntersectionResult).toHaveBeenCalledWith(
      [feature('u1')],
      15
    );
  });

  it('returns empty listings when there is no common ground', async () => {
    mockedComputeIntersectionResult.mockReturnValue({
      intersection: null,
      areaKm2: null,
      bufferedIntersection: null,
      bufferedAreaKm2: null,
    });

    const res = await GET(req, ctxWithId('s1'));
    const body = await res.json();

    expect(body.listings).toEqual([]);
    expect(mockedFetchListingsInPolygon).not.toHaveBeenCalled();
  });

  it('maps an unknown session or a non-member to 404 without fetching anything else', async () => {
    mockedGetSession.mockRejectedValue(new NotFound('session', 's1'));

    const res = await GET(req, ctxWithId('s1'));

    // The route() wrapper maps the store's NotFound to the status code — the
    // same posture as GET /api/sessions/[id].
    expect(res.status).toBe(404);
    expect(mockedGetIsochrone).not.toHaveBeenCalled();
    expect(mockedFetchListingsInPolygon).not.toHaveBeenCalled();
  });
});
