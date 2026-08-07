import { NextRequest } from 'next/server';
import { route } from '@/lib/session/route';
import { addTodo, listTodos } from '@/lib/session/store';

type Ctx = { params: Promise<{ id: string }> };

// Work the group has to do, open first.
export const GET = route(async (_r: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  return { todos: await listTodos(id) };
});

// Add a todo, optionally assigned to someone.
export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const { title, assignedTo, createdBy } = await request.json();
  return { todo: await addTodo(id, title, assignedTo ?? null, createdBy ?? null) };
});
