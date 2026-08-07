import { NextRequest } from 'next/server';
import { route } from '@/lib/session/route';
import { createFolder, listFolders } from '@/lib/session/store';

type Ctx = { params: Promise<{ id: string }> };

// Folders in the shared files hub.
export const GET = route(async (_r: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  return { folders: await listFolders(id) };
});

export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const { name, parentId } = await request.json();
  return { folder: await createFolder(id, name, parentId ?? null) };
});
