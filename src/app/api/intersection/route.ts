import { NextRequest, NextResponse } from 'next/server';
import { computeIntersectionResult } from '@/lib/intersection';

// Compute the common area of a set of isochrones, optionally extended by a
// search buffer percentage. Pure geometry over data the client already holds,
// so no auth: same posture as /api/isochrone. The computation itself lives in
// src/lib/intersection.ts, shared with the session bootstrap route — both
// callers must agree on what the search area is. Keeping turf here (rather
// than in the session page) keeps it out of the client bundle and off the
// main thread.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const isochrones = (body?.isochrones ?? []) as Parameters<
      typeof computeIntersectionResult
    >[0];
    const bufferPct = typeof body?.bufferPct === 'number' ? body.bufferPct : 0;

    if (!Array.isArray(isochrones)) {
      return NextResponse.json(
        { error: 'isochrones must be an array of GeoJSON features' },
        { status: 400 }
      );
    }

    return NextResponse.json(computeIntersectionResult(isochrones, bufferPct));
  } catch (error) {
    console.error('Intersection API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to compute intersection' },
      { status: 500 }
    );
  }
}
