'use client';

import React, { useState } from 'react';
import { Users, Unlink } from 'lucide-react';
import { CommuteConstraint } from '@/types/user';
import { Household } from '@/types/household';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

interface HouseholdsCardProps {
  sessionId: string;
  users: CommuteConstraint[];
  households: Household[];
  onChanged: () => void;
}

// Pairing participants into the units that decide. Six people with six
// commutes can be three couples buying one house, and every convergence
// signal counts households rather than heads — so this is where the group
// tells the app who it actually is.
export default function HouseholdsCard({
  sessionId,
  users,
  households,
  onChanged,
}: HouseholdsCardProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const unpaired = users.filter((u) => !u.householdId);
  const membersOf = (id: string) => users.filter((u) => u.householdId === id);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      // Offer the obvious name, but let it be overridden.
      const names = next.map((i) => users.find((u) => u.id === i)?.name).filter(Boolean);
      setName(names.join(' & '));
      return next;
    });
  };

  const pair = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/households`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, memberIds: selected }),
      });
      if (res.ok) {
        setSelected([]);
        setName('');
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  };

  const unpairHousehold = async (householdId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/households/${householdId}`, {
        method: 'DELETE',
      });
      if (res.ok) onChanged();
    } finally {
      setBusy(false);
    }
  };

  if (users.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" />
          Households
        </CardTitle>
        <span className="text-xs font-mono tabular-nums text-muted-foreground">
          {households.length + unpaired.length}
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Whoever decides together counts as one. Anyone unpaired decides alone.
        </p>

        {households.map((h) => (
          <div
            key={h.id}
            className="group flex items-center gap-2 rounded-md border border-border p-2.5 text-sm"
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{h.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {membersOf(h.id).map((m) => m.name).join(', ') || 'nobody left'}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => unpairHousehold(h.id)}
              disabled={busy}
              aria-label={`Unpair ${h.name}`}
            >
              <Unlink className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}

        {unpaired.length > 0 && (
          <div className="space-y-2 rounded-md border border-dashed border-border p-2.5">
            <div className="space-y-1.5">
              {unpaired.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={selected.includes(u.id)}
                    onCheckedChange={() => toggle(u.id)}
                  />
                  <span className="truncate">{u.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">decides alone</span>
                </label>
              ))}
            </div>

            {selected.length >= 2 && (
              <div className="flex gap-2 pt-1">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Household name"
                  className="h-8 text-sm"
                />
                <Button size="sm" onClick={pair} disabled={busy || !name.trim()}>
                  Pair
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
