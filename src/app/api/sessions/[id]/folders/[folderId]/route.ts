import { NextRequest } from 'next/server';
import { route } from '@/lib/session/route';
import { removeFolder } from '@/lib/session/store';

type Ctx = { params: Promise<{ id: string; folderId: string }> };

// Delete a folder; its files fall back to the root rather than being lost.
export const DELETE = route(async (_r: NextRequest, { params }: Ctx) => {
  const { id, folderId } = await params;
  await removeFolder(id, folderId);
  return { ok: true };
});
