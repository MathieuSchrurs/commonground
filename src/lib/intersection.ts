import { Feature, MultiPolygon, Polygon } from 'geojson';
import { bufferPolygon, calculateArea, computeIntersection } from './geo';

export interface IntersectionResult {
  intersection: Feature<Polygon | MultiPolygon> | null;
  areaKm2: number | null;
  bufferedIntersection: Feature<Polygon | MultiPolygon> | null;
  bufferedAreaKm2: number | null;
}

/**
 * The common ground of a set of isochrone areas, optionally extended by the
 * session's search buffer percentage. Pure geometry — shared by
 * /api/intersection (realtime updates) and the session bootstrap route so
 * both callers always agree on what the search area is.
 */
export function computeIntersectionResult(
  isochrones: Feature<Polygon | MultiPolygon>[],
  bufferPct: number
): IntersectionResult {
  const intersection = computeIntersection(isochrones);
  const areaKm2 = intersection ? calculateArea(intersection) : null;

  // The buffered area is what the session page displays and searches: it
  // lets the group look at properties just outside the strict common ground.
  const bufferedIntersection =
    intersection && bufferPct > 0 ? bufferPolygon(intersection, bufferPct) : intersection;
  const bufferedAreaKm2 = bufferedIntersection
    ? calculateArea(bufferedIntersection)
    : null;

  return { intersection, areaKm2, bufferedIntersection, bufferedAreaKm2 };
}
