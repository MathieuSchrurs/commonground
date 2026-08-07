'use client';

import React, { useState } from 'react';
import { Gavel, Undo2 } from 'lucide-react';
import { Decision } from '@/types/decisions';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface DecisionsSectionProps {
  sessionId: string;
  decisions: Decision[];
  users: { id: string; name: string }[];
  myUserId: string | null;
  onChanged: () => void;
}

function formatWhen(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// What the group has settled. Pointedly no checkbox: "we agreed max €650k" is
// not something you tick off. A decision can only be superseded, and the one it
// replaced stays visible so the reasoning is traceable.
export default function DecisionsSection({
  sessionId,
  decisions,
  users,
  myUserId,
  onChanged,
}: DecisionsSectionProps) {
  const [text, setText] = useState('');
  const [supersedesId, setSupersedesId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const live = decisions.filter((d) => !d.superseded_by);

  const record = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/decisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, decidedBy: myUserId, supersedesId }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error ?? 'Could not record that');
        return;
      }
      setText('');
      setSupersedesId(null);
      onChanged();
    } catch {
      setError('Could not reach the server');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Gavel className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Decided
        </span>
        <span className="text-xs font-mono tabular-nums text-muted-foreground ml-auto">
          {live.length}
        </span>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {decisions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing settled yet. Record what the group agrees so it stops being re-argued.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {decisions.map((d) => {
            const superseded = !!d.superseded_by;
            return (
              <li
                key={d.id}
                className={`rounded-md border p-2.5 text-sm ${
                  superseded ? 'border-dashed border-border bg-muted/30' : 'border-border'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`flex-1 min-w-0 ${
                      superseded ? 'text-muted-foreground line-through' : ''
                    }`}
                  >
                    {d.text}
                  </span>
                  {!superseded && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setSupersedesId(supersedesId === d.id ? null : d.id)}
                      aria-label={`Replace "${d.text}"`}
                      title="Replace this decision"
                    >
                      <Undo2
                        className={`h-3.5 w-3.5 ${
                          supersedesId === d.id ? 'text-foreground' : 'text-muted-foreground'
                        }`}
                      />
                    </Button>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {formatWhen(d.created_at)}
                  {d.decided_by && ` · ${nameOf.get(d.decided_by) ?? '?'}`}
                  {superseded && ' · replaced'}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex gap-2">
        <Input
          placeholder={supersedesId ? 'What replaces it?' : 'e.g. max €650k'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !busy && text.trim()) record(); }}
        />
        <Button size="sm" onClick={record} disabled={busy || !text.trim()}>
          {supersedesId ? 'Replace' : 'Record'}
        </Button>
      </div>

      <Separator />
    </div>
  );
}
