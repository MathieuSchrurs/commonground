import { getIsochrone } from '@/lib/mapbox';
import { createClient } from '@/utils/supabase/server';
import type { CommuteConstraint } from '@/types/user';

// The constraint update itself already succeeded and is durable in the DB, so
// nothing here — computing the isochrone or pushing it — is worth failing the
// request over. A client that misses the push falls back to its next reload.
export async function broadcastIsochroneUpdate(
  sessionId: string,
  constraint: CommuteConstraint
): Promise<void> {
  try {
    const response = await getIsochrone({
      lat: constraint.latitude,
      lng: constraint.longitude,
      minutes: constraint.maxMinutes,
      mode: constraint.transportMode,
    });
    const isochrone = response.features[0];

    const supabase = await createClient();
    await supabase.channel(`session_${sessionId}`).send({
      type: 'broadcast',
      event: 'isochrone-update',
      payload: { userId: constraint.id, isochrone },
    });
  } catch {
    // best-effort; swallow
  }
}
