import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// The agenda for the group's next meeting, oldest first (stable reading order).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('meeting_items')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ items: data ?? [] });
  } catch (error) {
    console.error('Error fetching meeting items:', error);
    return NextResponse.json({ error: 'Failed to fetch meeting items' }, { status: 500 });
  }
}

// Add an agenda line.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const { text, createdBy } = await request.json();

    if (!text || !text.trim()) {
      return NextResponse.json({ error: 'Agenda text is required' }, { status: 400 });
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('meeting_items')
      .insert([{ session_id: sessionId, text: text.trim(), created_by: createdBy ?? null } as never])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ item: data });
  } catch (error) {
    console.error('Error creating meeting item:', error);
    return NextResponse.json({ error: 'Failed to create meeting item' }, { status: 500 });
  }
}
