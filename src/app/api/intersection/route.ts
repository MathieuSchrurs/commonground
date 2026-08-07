import { NextRequest, NextResponse } from 'next/server';
import { Feature, Polygon, MultiPolygon } from 'geojson';
import { computeIntersection, calculateArea } from '@/lib/geo';

// Compute the common area of a set of isochrones. Pure geometry over data the
// client already holds, so no auth: same posture as /api/isochrone. Keeping
// turf here (rather than in the session page) keeps it out of the client
// bundle and off the main thread.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const isochrones = (body?.isochrones ?? []) as Feature<Polygon | MultiPolygon>[];

    if (!Array.isArray(isochrones)) {
      return NextResponse.json(
        { error: 'isochrones must be an array of GeoJSON features' },
        { status: 400 }
      );
    }

    const intersection = computeIntersection(isochrones);
    const areaKm2 = intersection ? calculateArea(intersection) : null;

    return NextResponse.json({ intersection, areaKm2 });
  } catch (error) {
    console.error('Intersection API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to compute intersection' },
      { status: 500 }
    );
  }
}
