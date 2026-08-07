-- Team dashboard: an agenda for the next meeting and a shared decisions/todo
-- checklist, both scoped to the session like every other dashboard feature.
-- The agenda is for "our next meeting" regardless of whether a pin is set yet,
-- so it hangs off the session (not session_meetings).

-- One checklist line for the next meeting. `done` marks it as handled; who
-- added it is attributed via created_by.
CREATE TABLE IF NOT EXISTS meeting_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES session_users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS meeting_items_session ON meeting_items (session_id);

-- The hunt-wide decisions/todo list. An item can be assigned to one person;
-- done_at records when it was closed so activity can later read it.
CREATE TABLE IF NOT EXISTS session_todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_to UUID REFERENCES session_users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES session_users(id) ON DELETE SET NULL,
  done_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS session_todos_session ON session_todos (session_id);

-- RLS: public access, consistent with the rest of the app (a trusted group).
ALTER TABLE meeting_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_todos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON meeting_items;
DROP POLICY IF EXISTS "Allow all" ON session_todos;
CREATE POLICY "Allow all" ON meeting_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON session_todos FOR ALL USING (true) WITH CHECK (true);

-- Realtime so agenda and todo changes land live for everyone in the session.
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_items;
ALTER PUBLICATION supabase_realtime ADD TABLE session_todos;
