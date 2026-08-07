'use client';

import React, { useState } from 'react';
import { MeetingItem } from '@/types/todos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Outcome = 'agreed' | 'todo' | 'drop';

interface CloseMeetingDialogProps {
  items: MeetingItem[];
  busy: boolean;
  onCancel: () => void;
  onClose: (decisions: string[], todos: string[]) => void;
}

// Closing wipes the agenda, so the group is asked what came out of it first —
// never a silent clear. Each item becomes something the group agreed, work
// someone has to do, or nothing at all.
export default function CloseMeetingDialog({
  items,
  busy,
  onCancel,
  onClose,
}: CloseMeetingDialogProps) {
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>(
    Object.fromEntries(items.map((i) => [i.id, i.done ? 'agreed' : 'todo'])),
  );
  const [extra, setExtra] = useState('');

  const submit = () => {
    const decisions = items.filter((i) => outcomes[i.id] === 'agreed').map((i) => i.text);
    const todos = items.filter((i) => outcomes[i.id] === 'todo').map((i) => i.text);
    if (extra.trim()) decisions.push(extra.trim());
    onClose(decisions, todos);
  };

  const OPTIONS: { value: Outcome; label: string }[] = [
    { value: 'agreed', label: 'Agreed' },
    { value: 'todo', label: 'To do' },
    { value: 'drop', label: 'Drop' },
  ];

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
      <p className="text-sm font-medium">What came out of it?</p>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nothing on the agenda — closing just resets it for next time.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.id} className="space-y-1">
              <div className="text-sm">{item.text}</div>
              <div className="flex gap-1">
                {OPTIONS.map((o) => (
                  <Button
                    key={o.value}
                    type="button"
                    size="sm"
                    variant={outcomes[item.id] === o.value ? 'default' : 'outline'}
                    className="h-6 px-2 text-xs"
                    onClick={() => setOutcomes((prev) => ({ ...prev, [item.id]: o.value }))}
                  >
                    {o.label}
                  </Button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Input
        placeholder="Anything else the group agreed?"
        value={extra}
        onChange={(e) => setExtra(e.target.value)}
      />

      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={busy}>
          Close meeting
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        The agenda is cleared once these are recorded. Cancelling changes nothing.
      </p>
    </div>
  );
}
