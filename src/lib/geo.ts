import * as turf from '@turf/turf';
import { Feature, Polygon, MultiPolygon } from 'geojson';

/**
 * Compute the intersection of multiple isochrone polygons
 * Returns the common area where all users can commute within their time limits
 */
export function computeIntersection(
  isochrones: Feature<Polygon | MultiPolygon>[]
): Feature<Polygon | MultiPolygon> | null {
  if (isochrones.length === 0) {
    return null;
  }

  if (isochrones.length === 1) {
    return isochrones[0];
  }

  try {
    // Start with the first isochrone
    let intersection = isochrones[0];

    // Iteratively intersect with each subsequent isochrone
    for (let i = 1; i < isochrones.length; i++) {
      const currentIsochrone = isochrones[i];
      
      // Calculate intersection
      const result = turf.intersect(
        turf.featureCollection([intersection, currentIsochrone])
      );

      // If intersection is null or empty, there's no common area
      if (!result) {
        return null;
      }

      intersection = result as Feature<Polygon | MultiPolygon>;
    }

    return intersection;
  } catch (error) {
    console.error('Error computing intersection:', error);
    return null;
  }
}

/**
 * Merge several polygons into one (their geographic OR). The crawler uses this
 * to fold every session's commute zone into a single search area, so each
 * listing source is scraped once over the union rather than per session.
 * Returns null for an empty list; passes a single polygon straight through.
 */
export function unionPolygons(
  polygons: Feature<Polygon | MultiPolygon>[]
): Feature<Polygon | MultiPolygon> | null {
  if (polygons.length === 0) return null;

  let merged = polygons[0];
  for (let i = 1; i < polygons.length; i++) {
    const result = turf.union(turf.featureCollection([merged, polygons[i]]));
    // turf.union returns null only for degenerate input; keep the accumulator
    // so one bad polygon can't drop the whole union.
    if (result) merged = result as Feature<Polygon | MultiPolygon>;
  }
  return merged;
}

/**
 * Calculate the area of a polygon in square kilometers
 */
export function calculateArea(
  polygon: Feature<Polygon | MultiPolygon>
): number {
  try {
    const area = turf.area(polygon);
    // Convert from square meters to square kilometers
    return area / 1000000;
  } catch (error) {
    console.error('Error calculating area:', error);
    return 0;
  }
}

