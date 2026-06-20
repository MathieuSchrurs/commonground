import { CommuteConstraint, TransportMode } from '@/types/user';

// The raw session_users row, as it lands from Supabase — including realtime
// payloads, which arrive snake_case straight from Postgres and never pass
// through the store. Keeping the mapping here (not inline in a page) is what
// lets the store and the client realtime handler share one definition.
export interface SessionUserRow {
  id: string;
  session_id?: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  max_minutes: number;
  transport_mode: TransportMode;
  created_at?: string;
  updated_at?: string;
}

export function toCommuteConstraint(row: SessionUserRow): CommuteConstraint {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    maxMinutes: row.max_minutes,
    transportMode: row.transport_mode,
  };
}
