import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Move a file to a folder (folderId: null = back to the root).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  try {
    const { id: sessionId, fileId } = await params;
    const { folderId } = await request.json();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('shared_files')
      .update({ folder_id: folderId ?? null } as never)
      .eq('id', fileId)
      .eq('session_id', sessionId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ file: data });
  } catch (error) {
    console.error('Error moving file:', error);
    return NextResponse.json({ error: 'Failed to move file' }, { status: 500 });
  }
}

// Delete a shared file: remove the Storage object, then the metadata row.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  try {
    const { id: sessionId, fileId } = await params;
    const supabase = await createClient();

    const { data: file, error: fetchError } = await supabase
      .from('shared_files')
      .select('storage_path')
      .eq('id', fileId)
      .eq('session_id', sessionId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Remove the bytes first; if this fails we keep the row so it can be retried.
    const storagePath = (file as { storage_path: string }).storage_path;
    const { error: storageError } = await supabase.storage
      .from('shared-files')
      .remove([storagePath]);
    if (storageError) throw storageError;

    const { error: deleteError } = await supabase
      .from('shared_files')
      .delete()
      .eq('id', fileId);
    if (deleteError) throw deleteError;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting file:', error);
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
  }
}
