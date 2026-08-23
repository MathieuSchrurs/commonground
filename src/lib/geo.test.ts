import { describe, expect, it } from 'vitest';
import { Feature, Polygon } from 'geojson';
import * as turf from '@turf/turf';
import { bufferPolygon, calculateArea, computeIntersection, unionPolygons } from './geo';

function square(minLng: number, minLat: number, size: number): Feature<Polygon> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [minLng, minLat],
        [minLng + size, minLat],
        [minLng + size, minLat + size],
        [minLng, minLat + size],
        [minLng, minLat],
      ]],
    },
  };
}

describe('computeIntersection', () => {
  it('returns null for no polygons', () => {
    expect(computeIntersection([])).toBeNull();
  });

  it('returns the single polygon unchanged', () => {
    const a = square(3.7, 51.0, 0.1);
    expect(computeIntersection([a])).toBe(a);
  });

  it('intersects overlapping polygons', () => {
    const a = square(3.7, 51.0, 0.1);
    const b = square(3.75, 51.05, 0.1); // overlaps the top-right quarter of a
    const result = computeIntersection([a, b]);

    expect(result).not.toBeNull();
    // The overlap is a quarter of each square's area
    expect(calculateArea(result!)).toBeCloseTo(calculateArea(a) / 4, 0);
  });

  it('returns null for disjoint polygons', () => {
    const a = square(3.7, 51.0, 0.1);
    const b = square(4.5, 51.5, 0.1);
    expect(computeIntersection([a, b])).toBeNull();
  });
});

describe('unionPolygons', () => {
  it('returns null for no polygons', () => {
    expect(unionPolygons([])).toBeNull();
  });

  it('returns the single polygon unchanged', () => {
    const a = square(3.7, 51.0, 0.1);
    expect(unionPolygons([a])).toBe(a);
  });

  it('merges two disjoint polygons into their combined area', () => {
    const a = square(3.7, 51.0, 0.1);
    const b = square(4.5, 51.5, 0.1); // far apart, no overlap
    const result = unionPolygons([a, b]);

    expect(result).not.toBeNull();
    // Disjoint union ≈ the sum of both areas
    expect(calculateArea(result!)).toBeCloseTo(calculateArea(a) + calculateArea(b), 0);
  });

  it('does not double-count overlapping polygons', () => {
    const a = square(3.7, 51.0, 0.1);
    const b = square(3.75, 51.05, 0.1); // overlaps a quarter of a
    const result = unionPolygons([a, b]);

    expect(result).not.toBeNull();
    // Union = 2 squares minus the shared quarter, so less than the naive sum
    expect(calculateArea(result!)).toBeLessThan(calculateArea(a) + calculateArea(b));
    expect(calculateArea(result!)).toBeGreaterThan(calculateArea(a));
  });
});

describe('calculateArea', () => {
  it('returns square kilometers', () => {
    // ~0.1° square near Gent ≈ 11.1 km × ~7 km ≈ 75-80 km²
    const area = calculateArea(square(3.7, 51.0, 0.1));
    expect(area).toBeGreaterThan(60);
    expect(area).toBeLessThan(100);
  });

  it('rounds to 2 decimal places', () => {
    const area = calculateArea(square(3.7, 51.0, 0.1373));
    expect(area).toBe(Math.round(area * 100) / 100);
  });
});

describe('bufferPolygon', () => {
  it('returns the polygon unchanged at 0%', () => {
    const a = square(3.7, 51.0, 0.1);
    expect(bufferPolygon(a, 0)).toBe(a);
    expect(bufferPolygon(a, -5)).toBe(a);
  });

  it('grows the area when pct > 0', () => {
    const a = square(3.7, 51.0, 0.1);
    const buffered = bufferPolygon(a, 10);
    expect(buffered).not.toBeNull();
    expect(calculateArea(buffered!)).toBeGreaterThan(calculateArea(a));
  });

  it('keeps every point of the original inside the buffer', () => {
    const a = square(3.7, 51.0, 0.1);
    const buffered = bufferPolygon(a, 10)!;
    for (const [lng, lat] of a.geometry.coordinates[0]) {
      expect(turf.booleanPointInPolygon(turf.point([lng, lat]), buffered)).toBe(true);
    }
  });

  it('caps the percentage so a huge pct cannot explode the zone', () => {
    const a = square(3.7, 51.0, 0.1);
    const buffered = bufferPolygon(a, 99)!;
    // Capped at 20% radius extension — far below the naive 99% growth.
    expect(calculateArea(buffered)).toBeLessThan(calculateArea(a) * 3);
  });
});
