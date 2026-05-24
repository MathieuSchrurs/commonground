'use client';

import { AlertTriangle } from 'lucide-react';
import { CommuteConstraint } from '@/types/user';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

interface ZoneLegendProps {
  users: CommuteConstraint[];
  intersectionArea: number | null;
  hasIntersection: boolean;
}

export default function ZoneLegend({ users, intersectionArea, hasIntersection }: ZoneLegendProps) {
  if (users.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Common ground</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasIntersection ? (
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
              Overlap area
            </div>
            <div className="font-mono text-2xl font-semibold tabular-nums">
              {intersectionArea !== null ? intersectionArea.toFixed(2) : '—'}
              <span className="text-sm text-muted-foreground font-normal ml-1">km²</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              The shaded green zone is where everyone&apos;s commute constraint is satisfied.
            </p>
          </div>
        ) : users.length > 1 ? (
          <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">No overlap yet</p>
              <p className="mt-1 text-amber-800">
                Try increasing one or more max commute times.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Add at least two locations to find shared ground.
          </p>
        )}

        {users.length > 0 && (
          <>
            <Separator />
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Participants
            </div>
            <div className="text-sm text-muted-foreground">
              <span className="font-mono tabular-nums text-foreground">{users.length}</span>
              {' '}
              {users.length === 1 ? 'person' : 'people'}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
