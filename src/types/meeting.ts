// The single pinned "next meeting" for a session. One row per session
// (see session_meetings.session_id UNIQUE), edited in place by anyone.
export interface Meeting {
  id: string;
  session_id: string;
  meets_at: string; // ISO timestamp
  location: string | null;
  note: string | null;
  updated_by: string | null; // session_users.id
  updated_at?: string;
}
