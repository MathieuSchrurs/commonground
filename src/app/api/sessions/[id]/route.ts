import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseClient();
    
    // Get session with all users
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (sessionError) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Get all users in this session
    const { data: users, error: usersError } = await supabase
      .from('session_users')
      .select('*')
      .eq('session_id', id)
      .order('created_at', { ascending: true });

    if (usersError) {
      throw usersError;
    }

    return NextResponse.json({
      session,
      users: users || []
    });
  } catch (error) {
    console.error('Error fetching session:', error);
    return NextResponse.json(
      { error: 'Failed to fetch session' },
      { status: 500 }
    );
  }
}
