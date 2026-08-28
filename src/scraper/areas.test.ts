import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Feature, Polygon } from 'geojson';
import { discoverAreas, slugifyCity } from './areas';
import { API_FETCH_TIMEOUT_MS, fetchWithTimeout } from '../lib/http';

vi.mock('../lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/http')>();
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
  };
});

describe('slugifyCity', () => {
  it('lowercases and dashes municipality names', () => {
    expect(slugifyCity('Gent')).toBe('gent');
    expect(slugifyCity('Sint-Martens-Latem')).toBe('sint-martens-latem');
    expect(slugifyCity('De Pinte')).toBe('de-pinte');
  });

  it('strips diacritics and apostrophes', () => {
    expect(slugifyCity('Évregnies')).toBe('evregnies');
    expect(slugifyCity("Sint-Job-in-'t-Goor")).toBe('sint-job-in-t-goor');
  });

  it('handles empty input', () => {
    expect(slugifyCity('')).toBe('');
  });
});

describe('discoverAreas fetch timeout', () => {
  const POLYGON: Feature<Polygon> = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [3.7, 51.0], [3.75, 51.0], [3.75, 51.05], [3.7, 51.05], [3.7, 51.0],
      ]],
    },
  };

  const mockResponse = {
    ok: true,
    json: () =>
      Promise.resolve({
        features: [
          {
            text: '9000',
            context: [{ id: 'place.123', text: 'Gent' }],
          },
        ],
      }),
  } as unknown as Response;

  beforeEach(() => {
    vi.mocked(fetchWithTimeout).mockClear();
    vi.mocked(fetchWithTimeout).mockResolvedValue(mockResponse);
    // Guards against the pre-migration code path (raw `fetch`) succeeding
    // silently and masking a missing fetchWithTimeout call.
    vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse);
  });

  it('uses the API fetch timeout for postcode lookups', async () => {
    await discoverAreas(POLYGON, 'test-token');

    expect(fetchWithTimeout).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      API_FETCH_TIMEOUT_MS
    );
  });
});
