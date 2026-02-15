export type TransportMode = 'driving' | 'cycling';

export interface CommuteConstraint {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  maxMinutes: number;
  transportMode: TransportMode;
}
