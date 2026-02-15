export interface GeocodeResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
}

export interface IsochroneRequest {
  lat: number;
  lng: number;
  minutes: number;
  mode: 'driving' | 'cycling';
}

export interface IsochroneResponse {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: {
      type: 'Polygon' | 'MultiPolygon';
      coordinates: number[][][] | number[][][][];
    };
    properties: Record<string, unknown>;
  }>;
}
