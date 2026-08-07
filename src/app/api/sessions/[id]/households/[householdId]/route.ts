import { NextRequest } from 'next/server';
import { route } from '@/lib/session/route';
import { dissolveHousehold } from '@/lib/session/store';

type Ctx = { params: Promise<{ id: string; householdId: string }> };

// Unpair: dissolving a household returns its members to households of one.
export const DELETE = route(async (_request: NextRequest, { params }: Ctx) => {
  const { id, householdId } = await params;
  await dissolveHousehold(id, householdId);
  return { ok: true };
});
