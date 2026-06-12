import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// All reactions for a session
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('listing_reactions')
      .select('*')
      .eq('session_id', sessionId);

    if (error) throw error;

    return NextResponse.json({ reactions: data ?? [] });
  } catch (error) {
    console.error('Error fetching reactions:', error);
    return NextResponse.json({ error: 'Failed to fetch reactions' }, { status: 500 });
  }
}

// Toggle a reaction: same reaction again removes it, a different one replaces it
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const { listingId, userId, reaction } = await request.json();

    if (!listingId || !userId || !['love', 'veto'].includes(reaction)) {
      return NextResponse.json(
        { error: 'listingId, userId and reaction (love|veto) are required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    const { data: existing, error: fetchError } = await supabase
      .from('listing_reactions')
      .select('*')
      .eq('session_id', sessionId)
      .eq('listing_id', listingId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (existing && (existing as { reaction: string }).reaction === reaction) {
      // Toggle off
      const { error } = await supabase
        .from('listing_reactions')
        .delete()
        .eq('id', (existing as { id: string }).id);
      if (error) throw error;
      return NextResponse.json({ reaction: null });
    }

    const { data, error } = await supabase
      .from('listing_reactions')
      .upsert(
        [{
          session_id: sessionId,
          listing_id: listingId,
          user_id: userId,
          reaction,
        } as never],
        { onConflict: 'session_id,listing_id,user_id' }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ reaction: data });
  } catch (error) {
    console.error('Error toggling reaction:', error);
    return NextResponse.json({ error: 'Failed to save reaction' }, { status: 500 });
  }
}
