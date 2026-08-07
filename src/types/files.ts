// A folder in a session's shared files hub. Files with folder_id === null
// live at the root of the hub, and so do folders with parent_id === null.
export interface Folder {
  id: string;
  session_id: string;
  name: string;
  // The folder this one sits inside. Null means the root — a permanent state,
  // not a migration artefact.
  parent_id: string | null;
  created_at?: string;
}

// Metadata for a file in the session's shared hub. The bytes live in the
// `shared-files` Supabase Storage bucket at `storage_path`.
export interface SharedFile {
  id: string;
  session_id: string;
  uploaded_by: string | null; // session_users.id
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  listing_id: string | null; // optional link to a property_listings row
  folder_id: string | null; // null = root of the hub
  note: string | null;
  created_at?: string;
}
