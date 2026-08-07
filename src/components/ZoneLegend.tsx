'use client';

import { AlertTriangle, Home, Loader2, RefreshCw } from 'lucide-react';
import { CommuteConstraint } from '@/types/user';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';

interface ZoneLegendProps {
  users: CommuteConstraint[];
  intersectionArea: number | null;
  hasIntersection: boolean;
  propertiesCount?: number;
  isScraping?: boolean;
  scrapeCompleted?: boolean;
  scrapeError?: string;
  bufferPct?: number;
  onBufferChange?: (pct: number) => void;
  onFindProperties?: () => void;
}

export default function ZoneLegend({
  users,
  intersectionArea,
  hasIntersection,
  propertiesCount = 0,
  isScraping = false,
  scrapeCompleted = false,
  scrapeError = '',
  bufferPct = 0,
  onBufferChange,
  onFindProperties,
}: ZoneLegendProps) {
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

            {onBufferChange && (
              <div className="mt-3 space-y-2">
                <div className="flex items-baseline justify-between">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Search buffer
                  </div>
                  <div className="text-xs font-mono tabular-nums text-foreground">
                    {bufferPct}%
                  </div>
                </div>
                <Slider
                  min={0}
                  max={15}
                  step={1}
                  value={[bufferPct]}
                  onValueChange={(v) => {
                    const n = Array.isArray(v) ? v[0] : Number(v);
                    onBufferChange(n);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  {bufferPct === 0
                    ? 'Search only inside the common ground.'
                    : `Extend the zone and search up to ${bufferPct}% beyond it — houses the whole group can still reach comfortably.`}
                </p>
              </div>
            )}

            {onFindProperties && (
              <div className="mt-3 space-y-2">
                <Button
                  onClick={() => onFindProperties()}
                  disabled={isScraping}
                  size="sm"
                  variant={propertiesCount > 0 ? 'outline' : 'default'}
                  className="w-full"
                >
                  {isScraping ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {propertiesCount > 0 ? 'Refreshing' : 'Searching'}
                    </>
                  ) : propertiesCount > 0 ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5" />
                      Refresh properties
                    </>
                  ) : (
                    <>
                      <Home className="h-3.5 w-3.5" />
                      Find properties
                    </>
                  )}
                </Button>
                {scrapeCompleted && (
                  <p className="text-xs text-muted-foreground">
                    {propertiesCount > 0 ? (
                      <>
                        <span className="font-mono tabular-nums text-foreground font-medium">{propertiesCount}</span>
                        {' '}{propertiesCount === 1 ? 'property' : 'properties'} for sale — shown as pins on the map.
                      </>
                    ) : (
                      <>No properties found in this zone yet.</>
                    )}
                  </p>
                )}
                {scrapeError && (
                  <p className="text-xs text-destructive">{scrapeError}</p>
                )}
              </div>
            )}
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
