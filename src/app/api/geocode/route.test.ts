import { describe, expect, it, vi } from 'vitest';
import { geocodeAddress } from '@/lib/mapbox';

vi.mock('@/lib/mapbox', () => ({ geocodeAddress: vi.fn() }));

// POST is imported after the mock so the real @/lib/mapbox module (which
// reads MAPBOX_SECRET_TOKEN at import time) never loads.
import { POST } from './route';

const mockedGeocodeAddress = vi.mocked(geocodeAddress);

function requestWithBody(body: unknown) {
  return { json: async () => body } as never;
}

const ctx = {} as never;

describe('POST /api/geocode', () => {
  it('rejects a missing address with 400', async () => {
    const res = await POST(requestWithBody({}), ctx);
    expect(res.status).toBe(400);
  });

  it('rejects a whitespace-only address with 400', async () => {
    const res = await POST(requestWithBody({ address: '   ' }), ctx);
    expect(res.status).toBe(400);
  });

  it('returns 404 when geocodeAddress finds nothing', async () => {
    mockedGeocodeAddress.mockResolvedValueOnce(null);
    const res = await POST(requestWithBody({ address: 'nowhere' }), ctx);
    expect(res.status).toBe(404);
  });

  it('returns 500 with a generic message when geocodeAddress throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedGeocodeAddress.mockRejectedValueOnce(new Error('Failed to geocode address'));
    const res = await POST(requestWithBody({ address: 'somewhere' }), ctx);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });

  it('returns the geocode result on success', async () => {
    const result = { latitude: 50.85, longitude: 4.35, formattedAddress: 'Brussels, Belgium' };
    mockedGeocodeAddress.mockResolvedValueOnce(result);
    const res = await POST(requestWithBody({ address: 'Brussels' }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
  });
});
