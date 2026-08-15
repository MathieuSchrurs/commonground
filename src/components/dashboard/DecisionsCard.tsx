'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Gavel, Undo2 } from 'lucide-react';
import { Decision } from '@/types/decisions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface DecisionsCardProps {
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

// What the group has settled — full width and its own card, not squeezed
// alongside todos. A decision never disappears the way a finished todo does
// (it's the hunt's track record, not its worklist), so it needs room to
// actually read as one rather than getting cut down to a few visible rows.
// Pointedly no checkbox: "we agreed max €650k" is not something you tick off.
// A decision can only be superseded, and the one it replaced stays visible so
// the reasoning is traceable.
export default function DecisionsCard({
  sessionId,
  decisions,
  users,
  myUserId,
  onChanged,
}: DecisionsCardProps) {
  const [text, setText] = useState('');
  const [supersedesId, setSupersedesId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const live = decisions.filter((d) => !d.superseded_by);

  // Decisions arrive oldest-first; collapsed shows the tail end of that —
  // the 3 most recently recorded — in the same chronological order they'd
  // read in expanded, so nothing reshuffles when you open it up.
  const visibleDecisions = expanded ? decisions : decisions.slice(-3);

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
    <Card className="ring-1 ring-foreground/20">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Gavel className="h-4 w-4" />
          Decisions
        </CardTitle>
        <span className="text-xs font-mono tabular-nums text-muted-foreground">
          {live.length}
        </span>
      </CardHeader>
      <CardContent className="space-y-2">
        {error && <p className="text-xs text-destructive">{error}</p>}

        {decisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing settled yet. Record what the group agrees so it stops being re-argued.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {visibleDecisions.map((d) => {
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
                      <span className="text-xs text-muted-foreground mr-1.5 whitespace-nowrap">
                        {formatWhen(d.created_at)}
                      </span>
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
                  {(d.decided_by || superseded) && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {[d.decided_by ? nameOf.get(d.decided_by) ?? '?' : null, superseded ? 'replaced' : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {decisions.length > 3 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground rounded-md py-0.5 hover:bg-accent/40"
            aria-expanded={expanded}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {expanded ? 'Show latest 3' : `Show all ${decisions.length}`}
          </button>
        )}

        <div className="flex gap-2">
          <Input
            placeholder={supersedesId ? 'What replaces it?' : 'e.g. max €650k'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !busy && text.trim()) record(); }}
          />
          <Button size="sm" variant="brand" onClick={record} disabled={busy || !text.trim()}>
            {supersedesId ? 'Replace' : 'Record'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
