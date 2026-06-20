'use client';

import React from 'react';
import { UserCircle2 } from 'lucide-react';
import { CommuteConstraint } from '@/types/user';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

interface IdentityPickerProps {
  users: Pick<CommuteConstraint, 'id' | 'name'>[];
  value: string | null;
  onChange: (userId: string) => void;
}

// "Who am I" for voting. No login: six people who trust each other pick their
// own name once per browser; the choice is kept in localStorage by the page.
export default function IdentityPicker({ users, value, onChange }: IdentityPickerProps) {
  if (users.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">You are</CardTitle>
        <UserCircle2 className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Label htmlFor="identity" className="sr-only">Select who you are</Label>
        <select
          id="identity"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="" disabled>Pick your name…</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        {!value && (
          <p className="text-xs text-muted-foreground">
            Pick your name to vote on properties.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
