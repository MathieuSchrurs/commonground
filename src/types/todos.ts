// One line of the group's meeting agenda. Lives on the session (not the
// meeting pin) so it survives the meeting being re-pinned.
export interface MeetingItem {
  id: string;
  session_id: string;
  text: string;
  done: boolean;
  created_by: string | null; // session_users.id
  created_at?: string;
}

// A shared decision/todo on the hunt. Optionally assigned to one person so
// everyone can see who owns it.
export interface Todo {
  id: string;
  session_id: string;
  title: string;
  done: boolean;
  assigned_to: string | null; // session_users.id
  created_by: string | null; // session_users.id
  done_at?: string | null;
  created_at?: string;
}
