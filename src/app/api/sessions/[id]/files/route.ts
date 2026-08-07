import { NextRequest } from 'next/server';
import { route } from '@/lib/session/route';
import { listFiles, recordFile } from '@/lib/session/store';

type Ctx = { params: Promise<{ id: string }> };

// Shared files, newest first.
export const GET = route(async (_r: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  return { files: await listFiles(id) };
});

// Record metadata for bytes the browser already uploaded to Storage.
export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  return { file: await recordFile(id, await request.json()) };
});
