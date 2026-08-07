import { NextRequest } from 'next/server';
import { route } from '@/lib/session/route';
import { formHousehold, listHouseholds } from '@/lib/session/store';

type Ctx = { params: Promise<{ id: string }> };

// The households in a session — the units that decide.
export const GET = route(async (_request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  return { households: await listHouseholds(id) };
});

// Pair participants into a household.
export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const { name, memberIds } = await request.json();
  return { household: await formHousehold(id, name, memberIds ?? []) };
});
