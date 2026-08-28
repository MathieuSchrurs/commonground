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
  household_id?: string | null;
  hide_commercial_listings?: boolean;
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
    householdId: row.household_id ?? null,
    hideCommercial: row.hide_commercial_listings,
  };
}

// The persisted search buffer as a usable percentage. The sessions row stores
// it snake_case and the store's own validation allows 0-20, but the slider
// can only express 0-15 — so everything that reads the buffer to widen the
// common ground clamps through here. Mapping lives in this file per
// CLAUDE.md, not inline in the routes that consume it.
export function clampedSearchBufferPct(row: { search_buffer_pct: number | null }): number {
  return Math.max(0, Math.min(15, row.search_buffer_pct ?? 0));
}
