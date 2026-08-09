'use client';

import React, { useState } from 'react';
import { ListChecks, Trash2, UserRound } from 'lucide-react';
import { Todo } from '@/types/todos';
import { Decision } from '@/types/decisions';
import DecisionsSection from './DecisionsSection';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const selectClass =
  'h-8 rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring';

interface TodosCardProps {
  sessionId: string;
  todos: Todo[];
  users: { id: string; name: string }[];
  myUserId: string | null;
  onChanged: () => void; // refetch todos after any change
  decisions: Decision[];
  onDecisionsChanged: () => void;
}

export default function TodosCard({
  sessionId,
  todos,
  users,
  myUserId,
  onChanged,
  decisions,
  onDecisionsChanged,
}: TodosCardProps) {
  const [title, setTitle] = useState('');
  const [assignedTo, setAssignedTo] = useState('');

  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const openCount = todos.filter((t) => !t.done).length;

  const handleAdd = async () => {
    if (!title.trim()) return;
    const res = await fetch(`/api/sessions/${sessionId}/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, assignedTo: assignedTo || null, createdBy: myUserId }),
    });
    if (res.ok) {
      setTitle('');
      setAssignedTo('');
      onChanged();
    }
  };

  const handleToggle = async (todo: Todo, done: boolean) => {
    const res = await fetch(`/api/sessions/${sessionId}/todos/${todo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done }),
    });
    if (res.ok) onChanged();
  };

  const handleAssign = async (todo: Todo, assignee: string) => {
    const res = await fetch(`/api/sessions/${sessionId}/todos/${todo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedTo: assignee || null }),
    });
    if (res.ok) onChanged();
  };

  const handleDelete = async (todoId: string) => {
    const res = await fetch(`/api/sessions/${sessionId}/todos/${todoId}`, { method: 'DELETE' });
    if (res.ok) onChanged();
  };

  return (
    <Card className="lg:aspect-[4/3]">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <ListChecks className="h-4 w-4" />
          Decisions &amp; todos
        </CardTitle>
        <span className="text-xs font-mono tabular-nums text-muted-foreground">
          {openCount} open
        </span>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {/* Two concepts, one card: a decision is settled and can only be
            superseded; a todo is work that gets done and disappears. */}
        <DecisionsSection
          sessionId={sessionId}
          decisions={decisions}
          users={users}
          myUserId={myUserId}
          onChanged={onDecisionsChanged}
        />

        <div className="flex items-center gap-2">
          <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            To do
          </span>
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="e.g. book a viewing Saturday"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          />
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className={`${selectClass} text-sm`}
            aria-label="Assign to"
          >
            <option value="">Anyone</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <Button size="sm" onClick={handleAdd} disabled={!title.trim()}>
            Add
          </Button>
        </div>

        {todos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No decisions or chores yet. Add the next thing the group needs to do.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {todos.map((todo) => (
              <li
                key={todo.id}
                className={`group flex items-center gap-2 rounded-md border border-border p-2.5 text-sm ${
                  todo.done ? 'bg-muted/40' : ''
                }`}
              >
                <Checkbox
                  checked={todo.done}
                  onCheckedChange={(v) => handleToggle(todo, v === true)}
                  aria-label={todo.done ? 'Mark as open' : 'Mark as done'}
                />
                <span className={`flex-1 min-w-0 truncate ${todo.done ? 'line-through text-muted-foreground' : ''}`}>
                  {todo.title}
                </span>
                {todo.assigned_to && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <UserRound className="h-3 w-3" />
                    {nameOf.get(todo.assigned_to) ?? '?'}
                  </span>
                )}
                <select
                  value={todo.assigned_to ?? ''}
                  onChange={(e) => handleAssign(todo, e.target.value)}
                  className={`${selectClass} ${todo.assigned_to ? '' : 'text-muted-foreground'}`}
                  aria-label="Reassign"
                >
                  <option value="">Anyone</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleDelete(todo.id)}
                  aria-label={`Delete ${todo.title}`}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
