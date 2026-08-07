'use client';

import React, { useState } from 'react';
import { CalendarClock, CheckCheck, ListChecks, MapPin, Pencil, Trash2 } from 'lucide-react';
import { Meeting } from '@/types/meeting';
import { MeetingItem } from '@/types/todos';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import CloseMeetingDialog from './CloseMeetingDialog';

interface NextMeetingCardProps {
  meeting: Meeting | null;
  canEdit: boolean; // false until an identity is picked
  onSave: (meetsAt: string, location: string, note: string) => Promise<void>;
  items: MeetingItem[];
  users: { id: string; name: string }[];
  onAddItem: (text: string) => Promise<void>;
  onToggleItem: (id: string, done: boolean) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onCloseMeeting: (decisions: string[], todos: string[]) => Promise<void>;
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

export default function NextMeetingCard({
  meeting,
  canEdit,
  onSave,
  items,
  users,
  onAddItem,
  onToggleItem,
  onDeleteItem,
  onCloseMeeting,
}: NextMeetingCardProps) {
  const [editing, setEditing] = useState(false);
  const [meetsAt, setMeetsAt] = useState('');
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [newItem, setNewItem] = useState('');
  const [closing, setClosing] = useState(false);
  const [closingBusy, setClosingBusy] = useState(false);

  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const doneCount = items.filter((i) => i.done).length;

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

  const handleAddItem = async () => {
    if (!newItem.trim()) return;
    await onAddItem(newItem.trim());
    setNewItem('');
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
      <CardContent className="space-y-3">
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

        <Separator />

        {/* Agenda for the next meeting, editable by anyone in the group. */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <ListChecks className="h-3.5 w-3.5" />
              Agenda
            </span>
            <div className="flex items-center gap-2">
              {items.length > 0 && (
                <span className="text-xs font-mono tabular-nums text-muted-foreground">
                  {doneCount}/{items.length}
                </span>
              )}
              {canEdit && !closing && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setClosing(true)}
                >
                  <CheckCheck className="h-3 w-3 mr-1" />
                  Close
                </Button>
              )}
            </div>
          </div>

          {closing && (
            <div className="mb-2">
              <CloseMeetingDialog
                items={items}
                busy={closingBusy}
                onCancel={() => setClosing(false)}
                onClose={async (decisions, todos) => {
                  setClosingBusy(true);
                  try {
                    await onCloseMeeting(decisions, todos);
                    setClosing(false);
                  } finally {
                    setClosingBusy(false);
                  }
                }}
              />
            </div>
          )}

          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground mb-2">
              Nothing on the agenda yet.{canEdit ? ' Add what to discuss.' : ''}
            </p>
          ) : (
            <ul className="space-y-1 mb-2">
              {items.map((item) => (
                <li key={item.id} className="group flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                  <Checkbox
                    checked={item.done}
                    onCheckedChange={(v) => onToggleItem(item.id, v === true)}
                    aria-label={item.done ? 'Mark as open' : 'Mark as done'}
                  />
                  <span className={`flex-1 min-w-0 ${item.done ? 'line-through text-muted-foreground' : ''}`}>
                    {item.text}
                  </span>
                  {item.created_by && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {nameOf.get(item.created_by) ?? '?'}
                    </span>
                  )}
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onDeleteItem(item.id)}
                      aria-label={`Delete ${item.text}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canEdit && (
            <div className="flex gap-2">
              <Input
                placeholder="Add an agenda item"
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddItem(); }}
              />
              <Button size="sm" variant="ghost" onClick={handleAddItem} disabled={!newItem.trim()}>
                Add
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
