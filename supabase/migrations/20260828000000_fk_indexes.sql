-- These foreign-key columns back a cascade delete or a common query filter
-- with no supporting index, forcing a sequential scan per affected row.
CREATE INDEX IF NOT EXISTS listing_reactions_listing ON listing_reactions (listing_id);
CREATE INDEX IF NOT EXISTS shared_files_listing ON shared_files (listing_id);
CREATE INDEX IF NOT EXISTS shared_files_folder ON shared_files (folder_id);
CREATE INDEX IF NOT EXISTS session_users_account_id ON session_users (account_id);
CREATE INDEX IF NOT EXISTS candidates_session ON candidates (session_id);
