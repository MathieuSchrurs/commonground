export type TransportMode = 'driving' | 'cycling';

export interface CommuteConstraint {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  maxMinutes: number;
  transportMode: TransportMode;
  // Which household this participant decides as. Null means a household of one.
  householdId?: string | null;
  // Whether commercial listings are hidden from this participant. Per
  // participant, not per household — see docs/adr/0004. Defaults to hidden at
  // the database, so this is optional here for the same reason householdId is.
  hideCommercial?: boolean;
}
