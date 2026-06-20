'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Loader2, Users, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

interface HubSession {
  id: string;
  name: string | null;
  role: string;
  members: { id: string; name: string | null }[];
  updatedAt: string | null;
}

// The signed-in account's home: the hunts they're part of, plus a way to name a
// new one. Sessions are fetched server-side and passed in; mutations refetch via
// router.refresh().
export default function Hub({ sessions }: { sessions: HubSession[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to create the hunt');
      }
      const { sessionId } = await res.json();
      router.push(`/session/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setCreating(false);
    }
  };

  const rename = async (id: string, current: string | null) => {
    const next = window.prompt('Rename this hunt', current ?? '');
    if (next == null || !next.trim() || next.trim() === current) return;
    const res = await fetch(`/api/sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: next.trim() }),
    });
    if (res.ok) router.refresh();
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your house hunts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick up where your group left off, or start a new one.
        </p>
      </div>

      <form onSubmit={create} className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name a new hunt — e.g. “The Ghent six”"
          disabled={creating}
        />
        <Button type="submit" disabled={creating || !name.trim()}>
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Plus className="h-4 w-4" /> New
            </>
          )}
        </Button>
      </form>
      {error && <p className="text-xs text-destructive">{error}</p>}

      {sessions.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No hunts yet. Name one above to get started.
        </p>
      ) : (
        <ul className="space-y-3">
          {sessions.map((s) => (
            <li key={s.id}>
              <Card>
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <Link href={`/session/${s.id}`} className="min-w-0 flex-1">
                    <p className="truncate font-medium">{s.name ?? 'Untitled hunt'}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {s.members.length} {s.members.length === 1 ? 'member' : 'members'}
                      {s.role === 'owner' && (
                        <span className="ml-1 rounded bg-muted px-1.5 py-0.5">owner</span>
                      )}
                    </p>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => rename(s.id, s.name)}
                    aria-label="Rename hunt"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
