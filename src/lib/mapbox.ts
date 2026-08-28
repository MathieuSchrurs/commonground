import mbxClient from '@mapbox/mapbox-sdk';
import mbxGeocoding from '@mapbox/mapbox-sdk/services/geocoding';
import { GeocodeResult, IsochroneRequest, IsochroneResponse } from '@/types/geo';
import { readIsochroneFromCache, writeIsochroneToCache } from './isochrone-cache';
import { API_FETCH_TIMEOUT_MS, fetchWithTimeout } from './http';

const MAPBOX_ACCESS_TOKEN = process.env.MAPBOX_SECRET_TOKEN;

if (!MAPBOX_ACCESS_TOKEN) {
  throw new Error('MAPBOX_SECRET_TOKEN environment variable is required');
}

const client = mbxClient({ accessToken: MAPBOX_ACCESS_TOKEN });
const geocodingClient = mbxGeocoding(client);

const ISOCHRONE_CACHE_TTL_MS = 10 * 60 * 1000;
const ISOCHRONE_COORD_PRECISION = 5;

interface IsochroneCacheEntry {
  promise: Promise<IsochroneResponse>;
  expiresAt: number;
}

const isochroneCache = new Map<string, IsochroneCacheEntry>();

function roundCoordinate(value: number): number {
  const factor = 10 ** ISOCHRONE_COORD_PRECISION;
  return Math.round(value * factor) / factor;
}

function isochroneCacheKey(params: IsochroneRequest): string {
  const { lat, lng, minutes, mode } = params;
  return `${roundCoordinate(lat)}:${roundCoordinate(lng)}:${minutes}:${mode}`;
}

/**
 * Geocode an address string to get coordinates
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  try {
    const response = await geocodingClient
      .forwardGeocode({
        query: address,
        limit: 1,
        autocomplete: false,
      })
      .send();

    const features = response.body.features;
    
    if (!features || features.length === 0) {
      return null;
    }

    const [longitude, latitude] = features[0].geometry.coordinates;
    const formattedAddress = features[0].place_name;

    return {
      latitude,
      longitude,
      formattedAddress,
    };
  } catch (error) {
    console.error('Geocoding error:', error);
    throw new Error('Failed to geocode address');
  }
}

/**
 * Get isochrone for a given location, time, and transport mode
 */
export async function getIsochrone(
  params: IsochroneRequest
): Promise<IsochroneResponse> {
  const { lat, lng, minutes, mode } = params;

  // Validate inputs
  if (!lat || !lng || !minutes || !mode) {
    throw new Error('Missing required parameters: lat, lng, minutes, mode');
  }

  if (minutes < 1 || minutes > 60) {
    throw new Error('Minutes must be between 1 and 60');
  }

  if (lat < -90 || lat > 90) {
    throw new Error('Latitude must be between -90 and 90');
  }

  if (lng < -180 || lng > 180) {
    throw new Error('Longitude must be between -180 and 180');
  }

  if (mode !== 'driving' && mode !== 'cycling') {
    throw new Error('Mode must be "driving" or "cycling"');
  }

  const key = isochroneCacheKey(params);
  const cached = isochroneCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise;
  }

  // Cache the promise, not the resolved value, so concurrent callers for the
  // same key await one in-flight chain instead of each triggering their own
  // database read and Mapbox fetch. The chain is registered BEFORE it awaits
  // anything, which is what makes that guarantee hold for callers that arrive
  // while the database lookup is still in flight.
  const promise = (async () => {
    // Second layer: the database. An isochrone is deterministic per rounded
    // constraint, so a stored one never goes stale — this is what keeps a
    // cold serverless instance (fresh deploy, scaled-out function) off the
    // Mapbox critical path entirely.
    const fromDb = await readIsochroneFromCache(key);
    if (fromDb) return fromDb;

    const body = await fetchIsochrone(lat, lng, minutes, mode);
    // An empty response would poison every consumer downstream (the page
    // stores features[0]) and, worse, would be persisted here forever —
    // reject it so the failure is visible and nothing is cached.
    if (!body.features || body.features.length === 0) {
      throw new Error('Mapbox returned an isochrone with no features');
    }
    return body;
  })();
  isochroneCache.set(key, { promise, expiresAt: Date.now() + ISOCHRONE_CACHE_TTL_MS });

  // Persist the result so every future instance serves it from the database.
  // writeIsochroneToCache is best-effort and never rejects; the empty second
  // handler keeps a fetch rejection from surfacing as an unhandled rejection
  // here (the eviction below already reports it to awaiting callers).
  promise.then(
    (body) => writeIsochroneToCache(key, body),
    () => {}
  );

  // A cached rejection would permanently poison this key, so evict on failure
  // and let the next call retry against Mapbox.
  promise.catch(() => {
    isochroneCache.delete(key);
  });

  return promise;
}

async function fetchIsochrone(
  lat: number,
  lng: number,
  minutes: number,
  mode: 'driving' | 'cycling'
): Promise<IsochroneResponse> {
  try {
    const response = await fetchWithTimeout(
      `https://api.mapbox.com/isochrone/v1/mapbox/${mode}/${lng},${lat}?contours_minutes=${minutes}&polygons=true&access_token=${MAPBOX_ACCESS_TOKEN}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      API_FETCH_TIMEOUT_MS
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `Mapbox API error: ${errorData.message || response.statusText}`
      );
    }

    const data = await response.json();
    return data as IsochroneResponse;
  } catch (error) {
    console.error('Isochrone API error:', error);
    throw new Error('Failed to fetch isochrone data');
  }
}
