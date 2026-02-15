import { NextRequest, NextResponse } from 'next/server';
import { geocodeAddress } from '@/lib/mapbox';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address } = body;

    // Validate input
    if (!address || typeof address !== 'string') {
      return NextResponse.json(
        { error: 'Address is required and must be a string' },
        { status: 400 }
      );
    }

    if (address.trim().length === 0) {
      return NextResponse.json(
        { error: 'Address cannot be empty' },
        { status: 400 }
      );
    }

    const result = await geocodeAddress(address.trim());

    if (!result) {
      return NextResponse.json(
        { error: 'Address not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Geocode API error:', error);
    return NextResponse.json(
      { error: 'Failed to geocode address' },
      { status: 500 }
    );
  }
}
