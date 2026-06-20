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
    });
  });
});
