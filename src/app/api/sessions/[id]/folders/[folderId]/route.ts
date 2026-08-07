import { NextRequest } from 'next/server';
import { route } from '@/lib/session/route';
import { moveFolder, removeFolder } from '@/lib/session/store';

type Ctx = { params: Promise<{ id: string; folderId: string }> };

// Move a folder into another (parentId: null = back to the root). Its children
// and files travel with it.
export const PATCH = route(async (request: NextRequest, { params }: Ctx) => {
  const { id, folderId } = await params;
  const { parentId } = await request.json();
  return { folder: await moveFolder(id, folderId, parentId ?? null) };
});

// Delete a folder; its files and child folders fall back to the root rather
// than being lost.
export const DELETE = route(async (_r: NextRequest, { params }: Ctx) => {
  const { id, folderId } = await params;
  await removeFolder(id, folderId);
  return { ok: true };
});
