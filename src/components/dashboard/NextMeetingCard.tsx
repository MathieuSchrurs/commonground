'use client';

import React, { useState } from 'react';
import { CalendarClock, MapPin, Pencil } from 'lucide-react';
import { Meeting } from '@/types/meeting';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface NextMeetingCardProps {
  meeting: Meeting | null;
  canEdit: boolean; // false until an identity is picked
  onSave: (meetsAt: string, location: string, note: string) => Promise<void>;
}

// An ISO timestamp -> the "YYYY-MM-DDTHH:mm" a datetime-local input expects,
// in the viewer's local time.
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function NextMeetingCard({ meeting, canEdit, onSave }: NextMeetingCardProps) {
  const [editing, setEditing] = useState(false);
  const [meetsAt, setMeetsAt] = useState('');
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setMeetsAt(toLocalInput(meeting?.meets_at ?? null));
    setLocation(meeting?.location ?? '');
    setNote(meeting?.note ?? '');
    setEditing(true);
  };

  const handleSave = async () => {
    if (!meetsAt) return;
    setSaving(true);
    try {
      // datetime-local has no timezone; new Date() reads it as local, toISOString normalises.
      await onSave(new Date(meetsAt).toISOString(), location.trim(), note.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarClock className="h-4 w-4" />
          Next meeting
        </CardTitle>
        {!editing && canEdit && (
          <Button variant="ghost" size="sm" onClick={startEdit} className="h-7 px-2 text-xs">
            <Pencil className="h-3 w-3 mr-1" />
            {meeting ? 'Edit' : 'Set'}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="meets-at">When</Label>
              <Input
                id="meets-at"
                type="datetime-local"
                value={meetsAt}
                onChange={(e) => setMeetsAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meets-location">Where</Label>
              <Input
                id="meets-location"
                placeholder="e.g. Anna & Tom's place"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meets-note">Note</Label>
              <Input
                id="meets-note"
                placeholder="e.g. bring the shortlist"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={!meetsAt || saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        ) : meeting ? (
          <div className="space-y-1">
            <div className="text-lg font-semibold tracking-tight">{formatWhen(meeting.meets_at)}</div>
            {meeting.location && (
              <div className="text-sm text-muted-foreground flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {meeting.location}
              </div>
            )}
            {meeting.note && <div className="text-sm text-muted-foreground italic">“{meeting.note}”</div>}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No meeting planned yet.{canEdit ? ' Click “Set” to pin one.' : ' Pick who you are to set one.'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
