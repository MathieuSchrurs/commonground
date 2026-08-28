import { API_FETCH_TIMEOUT_MS, fetchWithTimeout } from '../lib/http';

export interface GeocodedPoint {
  latitude: number;
  longitude: number;
  /** 'exact' for street-level matches, 'approximate' for postcode centroids */
  precision: 'exact' | 'approximate';
}

/**
 * Geocode an address string to lat/lng using the Mapbox API.
 * Biased toward Belgium. Returns null if the address cannot be resolved.
 * Street-level matches are 'exact'; postcode fallbacks are 'approximate' —
 * a postcode centroid is an area, not a property location.
 */
export async function geocodeAddress(address: string): Promise<GeocodedPoint | null> {
  const token = process.env.MAPBOX_SECRET_TOKEN;
  if (!token) throw new Error('MAPBOX_SECRET_TOKEN is not set');

  const query = encodeURIComponent(address);
  // Request address-level results first; fall back to postcode if not found
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?types=address,postcode&country=BE&limit=1&access_token=${token}`;

  const res = await fetchWithTimeout(url, undefined, API_FETCH_TIMEOUT_MS);
  if (!res.ok) return null;

  const data = await res.json();
  const feature = data.features?.[0];
  if (!feature) return null;

  const [longitude, latitude] = feature.geometry.coordinates;

  // Reject coordinates outside Belgium's bounding box
  if (longitude < 2.54 || longitude > 6.40 || latitude < 49.50 || latitude > 51.50) {
    return null;
  }

  const placeType: string[] = feature.place_type ?? [];
  return {
    latitude,
    longitude,
    precision: placeType.includes('address') ? 'exact' : 'approximate',
  };
}
