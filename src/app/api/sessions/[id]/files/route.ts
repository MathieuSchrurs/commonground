import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// All shared files for a session, newest first.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('shared_files')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ files: data ?? [] });
  } catch (error) {
    console.error('Error fetching files:', error);
    return NextResponse.json({ error: 'Failed to fetch files' }, { status: 500 });
  }
}

// Record metadata for a file. The bytes are uploaded to Storage by the browser
// first; this just persists the row that points at them.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const { fileName, storagePath, mimeType, sizeBytes, listingId, folderId, note, uploadedBy } =
      await request.json();

    if (!fileName || !storagePath) {
      return NextResponse.json(
        { error: 'fileName and storagePath are required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('shared_files')
      .insert([{
        session_id: sessionId,
        file_name: fileName,
        storage_path: storagePath,
        mime_type: mimeType ?? null,
        size_bytes: sizeBytes ?? null,
        listing_id: listingId ?? null,
        folder_id: folderId ?? null,
        note: note ?? null,
        uploaded_by: uploadedBy ?? null,
      } as never])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ file: data });
  } catch (error) {
    console.error('Error saving file:', error);
    return NextResponse.json({ error: 'Failed to save file' }, { status: 500 });
  }
}
