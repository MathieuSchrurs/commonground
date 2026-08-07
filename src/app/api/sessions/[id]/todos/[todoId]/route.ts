import { NextRequest } from 'next/server';
import { route } from '@/lib/session/route';
import { removeTodo, updateTodo } from '@/lib/session/store';

type Ctx = { params: Promise<{ id: string; todoId: string }> };

// Complete/reopen a todo and/or reassign it.
export const PATCH = route(async (request: NextRequest, { params }: Ctx) => {
  const { id, todoId } = await params;
  const { done, assignedTo } = await request.json();
  return { todo: await updateTodo(id, todoId, { done, assignedTo }) };
});

export const DELETE = route(async (_r: NextRequest, { params }: Ctx) => {
  const { id, todoId } = await params;
  await removeTodo(id, todoId);
  return { ok: true };
});
