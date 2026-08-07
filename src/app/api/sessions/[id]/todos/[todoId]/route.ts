import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Toggle a todo's done state (setting done_at when closed) and/or reassign it.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; todoId: string }> }
) {
  try {
    const { id: sessionId, todoId } = await params;
    const { done, assignedTo } = await request.json();
    const supabase = await createClient();

    const patch: Record<string, unknown> = {};
    if (done !== undefined) {
      patch.done = !!done;
      patch.done_at = done ? new Date().toISOString() : null;
    }
    if (assignedTo !== undefined) patch.assigned_to = assignedTo || null;

    const { data, error } = await supabase
      .from('session_todos')
      .update(patch as never)
      .eq('id', todoId)
      .eq('session_id', sessionId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ todo: data });
  } catch (error) {
    console.error('Error updating todo:', error);
    return NextResponse.json({ error: 'Failed to update todo' }, { status: 500 });
  }
}

// Remove a todo.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; todoId: string }> }
) {
  try {
    const { id: sessionId, todoId } = await params;
    const supabase = await createClient();

    const { error } = await supabase
      .from('session_todos')
      .delete()
      .eq('id', todoId)
      .eq('session_id', sessionId);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting todo:', error);
    return NextResponse.json({ error: 'Failed to delete todo' }, { status: 500 });
  }
}
