import { beforeEach, describe, expect, it, vi } from 'vitest';
import { geocodeAddress } from './geocode';
import { API_FETCH_TIMEOUT_MS, fetchWithTimeout } from '../lib/http';

vi.mock('../lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/http')>();
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
  };
});

const mockResponse = {
  ok: true,
  json: () =>
    Promise.resolve({
      features: [
        {
          geometry: { coordinates: [3.72, 51.05] },
          place_type: ['address'],
        },
      ],
    }),
} as unknown as Response;

describe('geocodeAddress fetch timeout', () => {
  beforeEach(() => {
    process.env.MAPBOX_SECRET_TOKEN = 'test-token';
    vi.mocked(fetchWithTimeout).mockClear();
    vi.mocked(fetchWithTimeout).mockResolvedValue(mockResponse);
    // Guards against the pre-migration code path (raw `fetch`) succeeding
    // silently and masking a missing fetchWithTimeout call.
    vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse);
  });

  it('fetches through fetchWithTimeout with the API timeout', async () => {
    await geocodeAddress('Veldstraat 1, Gent');

    expect(fetchWithTimeout).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      API_FETCH_TIMEOUT_MS
    );
  });
});
