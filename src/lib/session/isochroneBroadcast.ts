import { getIsochrone } from '@/lib/mapbox';
import { createClient } from '@/utils/supabase/server';
import type { CommuteConstraint } from '@/types/user';

export async function broadcastIsochroneUpdate(
  sessionId: string,
  constraint: CommuteConstraint
): Promise<void> {
  const response = await getIsochrone({
    lat: constraint.latitude,
    lng: constraint.longitude,
    minutes: constraint.maxMinutes,
    mode: constraint.transportMode,
  });
  const isochrone = response.features[0];

  // The constraint update itself already succeeded and is durable in the DB,
  // so a failed push here just means a client falls back to its next
  // refetch rather than losing data — not worth failing the request over.
  try {
    const supabase = await createClient();
    await supabase.channel(`session_${sessionId}`).send({
      type: 'broadcast',
      event: 'isochrone-update',
      payload: { userId: constraint.id, isochrone },
    });
  } catch {
    // best-effort broadcast; swallow
  }
}
