import { NextRequest } from 'next/server';
import { route } from '@/lib/session/route';
import { moveFolder, removeFolder, renameFolder } from '@/lib/session/store';

type Ctx = { params: Promise<{ id: string; folderId: string }> };

// Two distinct edits, kept mutually exclusive per request: renaming (a
// `name`) or moving (a `parentId`, where null means back to the root). Its
// children and files travel with it either way.
export const PATCH = route(async (request: NextRequest, { params }: Ctx) => {
  const { id, folderId } = await params;
  const body = await request.json();
  if (typeof body.name === 'string') {
    return { folder: await renameFolder(id, folderId, body.name) };
  }
  return { folder: await moveFolder(id, folderId, body.parentId ?? null) };
});

// Delete a folder; its files and child folders fall back to the root rather
// than being lost.
export const DELETE = route(async (_r: NextRequest, { params }: Ctx) => {
  const { id, folderId } = await params;
  await removeFolder(id, folderId);
  return { ok: true };
});
