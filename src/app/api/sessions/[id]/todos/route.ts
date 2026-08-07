import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// The group's decisions/todos. Open first, then oldest (momentum front and
// centre, finished items sink).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('session_todos')
      .select('*')
      .eq('session_id', sessionId)
      .order('done', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ todos: data ?? [] });
  } catch (error) {
    console.error('Error fetching todos:', error);
    return NextResponse.json({ error: 'Failed to fetch todos' }, { status: 500 });
  }
}

// Add a todo, optionally assigned to someone.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const { title, assignedTo, createdBy } = await request.json();

    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'A title is required' }, { status: 400 });
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('session_todos')
      .insert([{
        session_id: sessionId,
        title: title.trim(),
        assigned_to: assignedTo ?? null,
        created_by: createdBy ?? null,
      } as never])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ todo: data });
  } catch (error) {
    console.error('Error creating todo:', error);
    return NextResponse.json({ error: 'Failed to create todo' }, { status: 500 });
  }
}
