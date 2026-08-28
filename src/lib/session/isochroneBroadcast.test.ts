import { describe, expect, it, vi } from 'vitest';
import type { IsochroneResponse } from '@/types/geo';
import type { CommuteConstraint } from '@/types/user';
import { getIsochrone } from '@/lib/mapbox';
import { createClient } from '@/utils/supabase/server';

vi.mock('@/lib/mapbox', () => ({ getIsochrone: vi.fn() }));
vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn() }));

import { broadcastIsochroneUpdate } from './isochroneBroadcast';

const mockedGetIsochrone = vi.mocked(getIsochrone);
const mockedCreateClient = vi.mocked(createClient);

const feature: IsochroneResponse['features'][number] = {
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [[[4.35, 50.85]]] },
  properties: {},
};

const isochroneResponse: IsochroneResponse = {
  type: 'FeatureCollection',
  features: [feature],
};

const constraint: CommuteConstraint = {
  id: 'user-1',
  name: 'Alex',
  address: 'Grote Markt, Brussels',
  latitude: 50.85,
  longitude: 4.35,
  maxMinutes: 30,
  transportMode: 'cycling',
};

describe('broadcastIsochroneUpdate', () => {
  it('computes the isochrone once and broadcasts it on the session channel', async () => {
    mockedGetIsochrone.mockResolvedValueOnce(isochroneResponse);
    const send = vi.fn().mockResolvedValue('ok');
    const channel = vi.fn().mockReturnValue({ send });
    mockedCreateClient.mockResolvedValueOnce({ channel } as never);

    await broadcastIsochroneUpdate('session-1', constraint);

    expect(mockedGetIsochrone).toHaveBeenCalledTimes(1);
    expect(mockedGetIsochrone).toHaveBeenCalledWith({
      lat: 50.85,
      lng: 4.35,
      minutes: 30,
      mode: 'cycling',
    });

    expect(channel).toHaveBeenCalledWith('session_session-1');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'isochrone-update',
      payload: { userId: 'user-1', isochrone: feature },
    });
  });
});
