'use client';

import React from 'react';
import { CheckCircle2, ExternalLink, Hand, Heart, ListChecks, MessageSquare } from 'lucide-react';
import { Convergence, listingsAwaiting } from '@/lib/convergence';
import { MeetingItem, Todo } from '@/types/todos';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface NeedsYouCardProps {
  convergence: Convergence;
  todos: Todo[];
  items: MeetingItem[];
  myUserId: string | null;
  /** the household this participant decides as — their own id if unpaired */
  myHouseholdId: string | null;
}

// What the hunt is waiting on from the viewer, not what happened while they
// were away. An activity feed tells you the news; this tells you what to do
// about it — and silence is the thing that actually stalls a group of six.
export default function NeedsYouCard({
  convergence,
  todos,
  items,
  myUserId,
  myHouseholdId,
}: NeedsYouCardProps) {
  if (!myUserId) return null;

  const awaiting = myHouseholdId ? listingsAwaiting(convergence, myHouseholdId) : [];
  const myTodos = todos.filter((t) => !t.done && t.assigned_to === myUserId);
  const myItems = items.filter((i) => !i.done && i.created_by === myUserId);

  const nothing = awaiting.length === 0 && myTodos.length === 0 && myItems.length === 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Hand className="h-4 w-4" />
          Needs you
        </CardTitle>
        {!nothing && (
          <span className="text-xs font-mono tabular-nums text-muted-foreground">
            {awaiting.length + myTodos.length + myItems.length}
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {nothing ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Nothing waiting on you. The hunt is in everyone else&apos;s hands.
          </p>
        ) : (
          <>
            {awaiting.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <Heart className="h-3.5 w-3.5" />
                  Houses your household hasn&apos;t weighed in on
                </div>
                {awaiting.map(({ listing }) => (
                  <a
                    key={listing.id}
                    href={listing.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-2 rounded-md border border-border p-2.5 text-sm hover:bg-accent/30 transition-colors"
                  >
                    <span className="flex-1 min-w-0 truncate">
                      {listing.address ?? listing.city ?? listing.title ?? listing.url}
                    </span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                ))}
              </div>
            )}

            {myTodos.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <ListChecks className="h-3.5 w-3.5" />
                  Assigned to you
                </div>
                {myTodos.map((t) => (
                  <div key={t.id} className="rounded-md border border-border p-2.5 text-sm">
                    {t.title}
                  </div>
                ))}
              </div>
            )}

            {myItems.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" />
                  You raised, still open
                </div>
                {myItems.map((i) => (
                  <div key={i.id} className="rounded-md border border-border p-2.5 text-sm">
                    {i.text}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
