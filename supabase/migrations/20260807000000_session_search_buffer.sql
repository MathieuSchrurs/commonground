-- Per-session search buffer: the percentage by which the common ground zone
-- is extended (0-20%) when searching for properties. The session page buffers
-- the intersection it displays and searches; the crawler applies the same
-- buffer so scraped listings cover the zone just outside the strict overlap.
alter table sessions
  add column if not exists search_buffer_pct integer not null default 0
  constraint sessions_search_buffer_pct_range check (search_buffer_pct between 0 and 20);
