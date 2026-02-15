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

/**
 * Get the centroid (center point) of a polygon
 */
export function getCentroid(
  polygon: Feature<Polygon | MultiPolygon>
): { latitude: number; longitude: number } | null {
  try {
    const centroid = turf.centroid(polygon);
    const [longitude, latitude] = centroid.geometry.coordinates;
    return { latitude, longitude };
  } catch (error) {
    console.error('Error calculating centroid:', error);
    return null;
  }
}

/**
 * Check if a polygon is valid (not empty, has coordinates, etc.)
 */
export function isValidPolygon(
  polygon: Feature<Polygon | MultiPolygon> | null
): boolean {
  if (!polygon) return false;
  
  try {
    // Check if it's a valid GeoJSON feature
    if (!polygon.geometry || !polygon.geometry.coordinates) {
      return false;
    }

    // Validate using turf
    const bbox = turf.bbox(polygon);
    return bbox.length === 4;
  } catch {
    return false;
  }
}

/**
 * Flatten a MultiPolygon to an array of Polygons for easier rendering
 */
export function flattenMultiPolygon(
  feature: Feature<Polygon | MultiPolygon>
): Feature<Polygon>[] {
  if (feature.geometry.type === 'Polygon') {
    return [feature as Feature<Polygon>];
  }

  // Handle MultiPolygon
  const multiPolygon = feature as Feature<MultiPolygon>;
  return multiPolygon.geometry.coordinates.map((polygon, index) => ({
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: polygon,
    },
    properties: {
      ...feature.properties,
      partIndex: index,
    },
  }));
}
