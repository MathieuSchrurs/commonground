import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// Add a new user to the session
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const body = await request.json();
    const supabase = getSupabaseClient();
    
    const { name, address, latitude, longitude, maxMinutes, transportMode } = body;

    // Validate required fields
    if (!name || !address || !latitude || !longitude || !maxMinutes || !transportMode) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('session_users')
      .insert([{
        session_id: sessionId,
        name,
        address,
        latitude,
        longitude,
        max_minutes: maxMinutes,
        transport_mode: transportMode,
      } as never])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error adding user:', error);
    return NextResponse.json(
      { error: 'Failed to add user' },
      { status: 500 }
    );
  }
}
