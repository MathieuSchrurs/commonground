import * as turf from '@turf/turf';
import { Feature, Polygon, MultiPolygon } from 'geojson';

export interface Area {
  postalCode: string;
  city: string;
  /** lowercase, diacritics stripped, spaces as dashes — e.g. "sint-martens-latem" */
  citySlug: string;
}

export function slugifyCity(city: string): string {
  return city
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/['’]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Sample a grid of points inside the polygon and reverse-geocode them to
 * Belgian postal codes + municipality names. Every area-filtered scraper
 * (Realo, Immoweb, Immovlan, ImmoScoop) keys off this one discovery pass.
 */
export async function discoverAreas(
  polygon: Feature<Polygon | MultiPolygon>,
  mapboxToken: string
): Promise<Area[]> {
  const [minLng, minLat, maxLng, maxLat] = turf.bbox(polygon);
  const steps = 5;
  const candidates: [number, number][] = [];

  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const lng = minLng + (maxLng - minLng) * (i / steps);
      const lat = minLat + (maxLat - minLat) * (j / steps);
      const pt = turf.point([lng, lat]);
      if (turf.booleanPointInPolygon(pt, polygon)) {
        candidates.push([lng, lat]);
      }
    }
  }

  // Always include the centroid
  const centroid = turf.centroid(polygon);
  candidates.push([centroid.geometry.coordinates[0], centroid.geometry.coordinates[1]]);

  console.log(`[areas] Sampling ${candidates.length} points inside polygon`);

  const results = await Promise.all(
    candidates.map(async ([lng, lat]): Promise<Area | null> => {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=postcode&country=BE&limit=1&access_token=${mapboxToken}`;
      const res = await fetch(url).catch(() => null);
      if (!res?.ok) return null;
      const data = await res.json();
      const feature = data.features?.[0];
      if (!feature?.text) return null;
      // The postcode feature's context carries the municipality ("place")
      const place = (feature.context as Array<{ id: string; text: string }> | undefined)
        ?.find(c => c.id.startsWith('place'))?.text;
      const city = place ?? '';
      return { postalCode: feature.text as string, city, citySlug: slugifyCity(city) };
    })
  );

  const byCode = new Map<string, Area>();
  for (const a of results) {
    if (a && !byCode.has(a.postalCode)) byCode.set(a.postalCode, a);
  }
  const areas = [...byCode.values()];
  console.log(`[areas] Discovered ${areas.length} postal areas: ${areas.map(a => `${a.postalCode} ${a.city}`).join(', ')}`);
  return areas;
}
