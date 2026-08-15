'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, ListChecks, Trash2, UserRound } from 'lucide-react';
import { Todo } from '@/types/todos';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const selectClass =
  'h-8 rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring';

interface TodosCardProps {
  sessionId: string;
  todos: Todo[];
  users: { id: string; name: string }[];
  myUserId: string | null;
  onChanged: () => void; // refetch todos after any change
}

export default function TodosCard({
  sessionId,
  todos,
  users,
  myUserId,
  onChanged,
}: TodosCardProps) {
  const [title, setTitle] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [showDone, setShowDone] = useState(false);
  const nameOf = new Map(users.map((u) => [u.id, u.name]));

  // A finished todo disappears from the group's attention (unlike a decision,
  // which stays visible forever) — but "disappears" still needs an undo, so it
  // moves into a collapsed section rather than vanishing outright.
  const openTodos = todos.filter((t) => !t.done);
  const doneTodos = todos.filter((t) => t.done);
  const openCount = openTodos.length;

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

  const renderTodo = (todo: Todo) => (
    <li
      key={todo.id}
      className={`rounded-md border border-border p-2.5 text-sm ${
        todo.done ? 'bg-muted/40' : ''
      }`}
    >
      {/* Checkbox, title, assignee, and delete all share one line. Icons
          rather than a name-wide select is what makes this fit even at xl,
          where this card is a quarter of the grid — the old select showing
          the assignee's full name was the thing that used to force this
          onto its own row. items-start (not center) so a title long enough
          to wrap keeps the icons pinned to the first line, not re-centered
          against the whole wrapped block. */}
      <div className="flex items-start gap-2">
        <Checkbox
          checked={todo.done}
          onCheckedChange={(v) => handleToggle(todo, v === true)}
          aria-label={todo.done ? 'Mark as open' : 'Mark as done'}
          className="mt-0.5 shrink-0"
        />
        <span className={`flex-1 min-w-0 break-words ${todo.done ? 'line-through text-muted-foreground' : ''}`}>
          {todo.title}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'shrink-0')}
            aria-label={`Assignee for ${todo.title}: ${todo.assigned_to ? nameOf.get(todo.assigned_to) ?? 'someone' : 'Anyone'}`}
          >
            <UserRound className={`h-3.5 w-3.5 ${todo.assigned_to ? 'text-foreground' : 'text-muted-foreground'}`} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              value={todo.assigned_to ?? ''}
              onValueChange={(v) => handleAssign(todo, v as string)}
            >
              <DropdownMenuRadioItem value="">Anyone</DropdownMenuRadioItem>
              {users.map((u) => (
                <DropdownMenuRadioItem key={u.id} value={u.id}>{u.name}</DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          onClick={() => handleDelete(todo.id)}
          aria-label={`Delete ${todo.title}`}
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
        </Button>
      </div>
    </li>
  );

  return (
    <Card className="lg:aspect-[4/3] xl:aspect-auto ring-1 ring-foreground/20">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <ListChecks className="h-4 w-4" />
          To do
        </CardTitle>
        <span className="text-xs font-mono tabular-nums text-muted-foreground">
          {openCount} open
        </span>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto">

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
          <Button size="sm" variant="brand" onClick={handleAdd} disabled={!title.trim()}>
            Add
          </Button>
        </div>

        {todos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No decisions or chores yet. Add the next thing the group needs to do.
          </p>
        ) : (
          <>
            {openTodos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing open right now.</p>
            ) : (
              <ul className="space-y-1.5">{openTodos.map(renderTodo)}</ul>
            )}

            {doneTodos.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowDone((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground rounded-md py-0.5 hover:bg-accent/40"
                  aria-expanded={showDone}
                >
                  {showDone ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  {doneTodos.length} done
                </button>
                {showDone && (
                  <ul className="space-y-1.5 mt-1.5">{doneTodos.map(renderTodo)}</ul>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
