import { describe, expect, it } from 'vitest';
import { Feature, Polygon } from 'geojson';
import { calculateArea, computeIntersection, unionPolygons } from './geo';

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
});
