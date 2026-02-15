import mbxClient from '@mapbox/mapbox-sdk';
import mbxGeocoding from '@mapbox/mapbox-sdk/services/geocoding';
import { GeocodeResult, IsochroneRequest, IsochroneResponse } from '@/types/geo';

const MAPBOX_ACCESS_TOKEN = process.env.MAPBOX_SECRET_TOKEN;

if (!MAPBOX_ACCESS_TOKEN) {
  throw new Error('MAPBOX_SECRET_TOKEN environment variable is required');
}

const client = mbxClient({ accessToken: MAPBOX_ACCESS_TOKEN });
const geocodingClient = mbxGeocoding(client);

/**
 * Geocode an address string to get coordinates
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  try {
    const response = await geocodingClient
      .forwardGeocode({
        query: address,
        limit: 1,
        autocomplete: false,
      })
      .send();

    const features = response.body.features;
    
    if (!features || features.length === 0) {
      return null;
    }

    const [longitude, latitude] = features[0].geometry.coordinates;
    const formattedAddress = features[0].place_name;

    return {
      latitude,
      longitude,
      formattedAddress,
    };
  } catch (error) {
    console.error('Geocoding error:', error);
    throw new Error('Failed to geocode address');
  }
}

/**
 * Get isochrone for a given location, time, and transport mode
 */
export async function getIsochrone(
  params: IsochroneRequest
): Promise<IsochroneResponse> {
  const { lat, lng, minutes, mode } = params;

  // Validate inputs
  if (!lat || !lng || !minutes || !mode) {
    throw new Error('Missing required parameters: lat, lng, minutes, mode');
  }

  if (minutes < 1 || minutes > 60) {
    throw new Error('Minutes must be between 1 and 60');
  }

  if (lat < -90 || lat > 90) {
    throw new Error('Latitude must be between -90 and 90');
  }

  if (lng < -180 || lng > 180) {
    throw new Error('Longitude must be between -180 and 180');
  }

  if (mode !== 'driving' && mode !== 'cycling') {
    throw new Error('Mode must be "driving" or "cycling"');
  }

  try {
    const response = await fetch(
      `https://api.mapbox.com/isochrone/v1/mapbox/${mode}/${lng},${lat}?contours_minutes=${minutes}&polygons=true&access_token=${MAPBOX_ACCESS_TOKEN}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `Mapbox API error: ${errorData.message || response.statusText}`
      );
    }

    const data = await response.json();
    return data as IsochroneResponse;
  } catch (error) {
    console.error('Isochrone API error:', error);
    throw new Error('Failed to fetch isochrone data');
  }
}
