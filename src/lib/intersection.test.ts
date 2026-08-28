import { describe, expect, it } from 'vitest';
import { computeIntersectionResult } from './intersection';
import { Feature, Polygon } from 'geojson';

// Two overlapping circles-as-polygons around Ghent, far enough apart that the
// intersection is a real (small) area rather than everything or nothing.
function circle(lng: number, lat: number): Feature<Polygon> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        Array.from({ length: 33 }, (_, i) => {
          const a = (i / 32) * 2 * Math.PI;
          return [lng + 0.02 * Math.cos(a), lat + 0.02 * Math.sin(a)];
        }),
      ],
    },
  };
}

describe('computeIntersectionResult', () => {
  it('returns the intersection, its area, and the buffered variants', () => {
    const result = computeIntersectionResult([circle(3.72, 51.05), circle(3.74, 51.06)], 0);

    expect(result.intersection).not.toBeNull();
    expect(result.areaKm2).toBeGreaterThan(0);
    // A zero buffer leaves the buffered area equal to the strict one.
    expect(result.bufferedIntersection).toEqual(result.intersection);
    expect(result.bufferedAreaKm2).toEqual(result.areaKm2);
  });

  it('extends the search area by the buffer percentage', () => {
    const strict = computeIntersectionResult([circle(3.72, 51.05), circle(3.74, 51.06)], 0);
    const buffered = computeIntersectionResult([circle(3.72, 51.05), circle(3.74, 51.06)], 10);

    expect(buffered.bufferedAreaKm2!).toBeGreaterThan(strict.bufferedAreaKm2!);
    expect(buffered.areaKm2).toEqual(strict.areaKm2);
  });

  it('returns nulls when there is no common ground', () => {
    const result = computeIntersectionResult([circle(3.72, 51.05), circle(4.5, 50.9)], 5);

    expect(result.intersection).toBeNull();
    expect(result.areaKm2).toBeNull();
    expect(result.bufferedIntersection).toBeNull();
    expect(result.bufferedAreaKm2).toBeNull();
  });
});
