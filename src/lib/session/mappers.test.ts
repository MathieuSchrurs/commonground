import { describe, expect, it } from 'vitest';
import { toCommuteConstraint, SessionUserRow } from './mappers';

describe('toCommuteConstraint', () => {
  it('maps a snake_case session_users row to a camelCase constraint', () => {
    const row: SessionUserRow = {
      id: 'u1',
      session_id: 's1',
      name: 'Anna',
      address: 'Gent',
      latitude: 51.05,
      longitude: 3.72,
      max_minutes: 30,
      transport_mode: 'cycling',
      created_at: '2026-06-01T00:00:00Z',
    };
    expect(toCommuteConstraint(row)).toEqual({
      id: 'u1',
      name: 'Anna',
      address: 'Gent',
      latitude: 51.05,
      longitude: 3.72,
      maxMinutes: 30,
      transportMode: 'cycling',
      householdId: null,
    });
  });

  it('carries the household a participant decides as', () => {
    const row: SessionUserRow = {
      id: 'u1',
      name: 'Anna',
      address: 'Gent',
      latitude: 51.05,
      longitude: 3.72,
      max_minutes: 30,
      transport_mode: 'cycling',
      household_id: 'h1',
    };
    expect(toCommuteConstraint(row).householdId).toBe('h1');
  });

  it('reads an unpaired participant as belonging to no household', () => {
    const row: SessionUserRow = {
      id: 'u1',
      name: 'Anna',
      address: 'Gent',
      latitude: 51.05,
      longitude: 3.72,
      max_minutes: 30,
      transport_mode: 'cycling',
    };
    // Null, not undefined: a household of one is a real state, not missing data.
    expect(toCommuteConstraint(row).householdId).toBeNull();
  });
});
