import { NextRequest, NextResponse } from 'next/server';
import { getIsochrone } from '@/lib/mapbox';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lat, lng, minutes, mode } = body;

    // Validate input
    if (lat === undefined || lng === undefined || minutes === undefined || mode === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: lat, lng, minutes, mode' },
        { status: 400 }
      );
    }

    if (typeof lat !== 'number' || typeof lng !== 'number' || typeof minutes !== 'number') {
      return NextResponse.json(
        { error: 'lat, lng, and minutes must be numbers' },
        { status: 400 }
      );
    }

    if (typeof mode !== 'string' || (mode !== 'driving' && mode !== 'cycling')) {
      return NextResponse.json(
        { error: 'mode must be "driving" or "cycling"' },
        { status: 400 }
      );
    }

    const result = await getIsochrone({ lat, lng, minutes, mode });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Isochrone API error:', error);
    
    // Check if it's a validation error from the service
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch isochrone data' },
      { status: 500 }
    );
  }
}
