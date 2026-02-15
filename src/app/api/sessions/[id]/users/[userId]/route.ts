import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// Update a user
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const { id: sessionId, userId } = await params;
    const body = await request.json();
    const supabase = getSupabaseClient();
    
    const { name, address, latitude, longitude, maxMinutes, transportMode } = body;

    const { data, error } = await supabase
      .from('session_users')
      .update({
        name,
        address,
        latitude,
        longitude,
        max_minutes: maxMinutes,
        transport_mode: transportMode,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', userId)
      .eq('session_id', sessionId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    );
  }
}

// Delete a user
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const { id: sessionId, userId } = await params;
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('session_users')
      .delete()
      .eq('id', userId)
      .eq('session_id', sessionId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
