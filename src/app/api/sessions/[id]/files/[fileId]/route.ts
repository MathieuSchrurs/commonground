import { NextRequest } from 'next/server';
import { route } from '@/lib/session/route';
import { moveFile, removeFile } from '@/lib/session/store';

type Ctx = { params: Promise<{ id: string; fileId: string }> };

// Move a file to a folder (folderId: null = back to the root).
export const PATCH = route(async (request: NextRequest, { params }: Ctx) => {
  const { id, fileId } = await params;
  const { folderId } = await request.json();
  return { file: await moveFile(id, fileId, folderId ?? null) };
});

// Remove the Storage object, then the row.
export const DELETE = route(async (_r: NextRequest, { params }: Ctx) => {
  const { id, fileId } = await params;
  await removeFile(id, fileId);
  return { ok: true };
});
