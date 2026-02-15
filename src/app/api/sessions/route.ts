import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// Create a new session
export async function POST() {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('sessions')
      .insert([{} as never])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ sessionId: (data as { id: string }).id });
  } catch (error) {
    console.error('Error creating session:', error);
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    );
  }
}
