import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Delete a folder. Its files fall back to the root (folder_id is set null by
// the FK's ON DELETE SET NULL), so nothing is lost.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; folderId: string }> }
) {
  try {
    const { id: sessionId, folderId } = await params;
    const supabase = await createClient();

    const { error } = await supabase
      .from('session_folders')
      .delete()
      .eq('id', folderId)
      .eq('session_id', sessionId);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting folder:', error);
    return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 });
  }
}
