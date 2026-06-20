import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// The single pinned meeting for a session (or null if none set yet).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('session_meetings')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({ meeting: data ?? null });
  } catch (error) {
    console.error('Error fetching meeting:', error);
    return NextResponse.json({ error: 'Failed to fetch meeting' }, { status: 500 });
  }
}

// Create or replace the session's next meeting (UNIQUE on session_id).
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const { meetsAt, location, note, updatedBy } = await request.json();

    if (!meetsAt || isNaN(Date.parse(meetsAt))) {
      return NextResponse.json(
        { error: 'A valid meetsAt timestamp is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('session_meetings')
      .upsert(
        [{
          session_id: sessionId,
          meets_at: meetsAt,
          location: location ?? null,
          note: note ?? null,
          updated_by: updatedBy ?? null,
          updated_at: new Date().toISOString(),
        } as never],
        { onConflict: 'session_id' }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ meeting: data });
  } catch (error) {
    console.error('Error saving meeting:', error);
    return NextResponse.json({ error: 'Failed to save meeting' }, { status: 500 });
  }
}
