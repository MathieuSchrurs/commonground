import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Toggle an agenda line's done state.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id: sessionId, itemId } = await params;
    const { done } = await request.json();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('meeting_items')
      .update({ done: !!done } as never)
      .eq('id', itemId)
      .eq('session_id', sessionId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ item: data });
  } catch (error) {
    console.error('Error updating meeting item:', error);
    return NextResponse.json({ error: 'Failed to update meeting item' }, { status: 500 });
  }
}

// Remove an agenda line.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id: sessionId, itemId } = await params;
    const supabase = await createClient();

    const { error } = await supabase
      .from('meeting_items')
      .delete()
      .eq('id', itemId)
      .eq('session_id', sessionId);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting meeting item:', error);
    return NextResponse.json({ error: 'Failed to delete meeting item' }, { status: 500 });
  }
}
