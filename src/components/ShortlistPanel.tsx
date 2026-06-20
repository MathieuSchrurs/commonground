'use client';

import React, { useMemo } from 'react';
import { ExternalLink, Heart, X } from 'lucide-react';
import { PropertyListing } from '@/scraper/types';
import { ListingReaction } from '@/types/reactions';
import { CommuteConstraint } from '@/types/user';
import { computeFavorites } from '@/lib/favorites';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ShortlistPanelProps {
  properties: PropertyListing[];
  reactions: ListingReaction[];
  users: CommuteConstraint[];
}

function formatPrice(price?: number): string {
  if (!price) return 'Price on request';
  return `€${price.toLocaleString('nl-BE')}`;
}

// The convergence view: every listing at least one person has hearted,
// ranked by heart count, with unanimous picks called out.
export default function ShortlistPanel({ properties, reactions, users }: ShortlistPanelProps) {
  const shortlist = useMemo(
    () => computeFavorites(properties, reactions, users),
    [properties, reactions, users],
  );

  if (shortlist.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Shortlist</CardTitle>
        <span className="text-xs font-mono tabular-nums text-muted-foreground">
          {shortlist.length}
        </span>
      </CardHeader>
      <CardContent className="space-y-2">
        {shortlist.map(({ listing, loveNames, vetoNames, unanimous }) => (
          <a
            key={listing.id}
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group block rounded-md border border-border p-3 transition-colors hover:bg-accent/30"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold font-mono tabular-nums">
                {formatPrice(listing.price)}
              </span>
              {listing.previous_price != null && listing.price != null && listing.previous_price !== listing.price && (
                <span className={`text-xs font-medium ${listing.price < listing.previous_price ? 'text-green-600' : 'text-red-600'}`}>
                  {listing.price < listing.previous_price ? '↓' : '↑'} was {formatPrice(listing.previous_price)}
                </span>
              )}
              {unanimous && (
                <Badge className="gap-1 bg-amber-500 text-white hover:bg-amber-500">
                  <Heart className="h-3 w-3 fill-current" />
                  everyone
                </Badge>
              )}
              <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="text-xs text-muted-foreground truncate mt-0.5">
              {listing.address ?? listing.city ?? listing.title ?? listing.url}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs">
              <span className="flex items-center gap-1 text-rose-600">
                <Heart className="h-3 w-3 fill-current" />
                {loveNames.join(', ')}
              </span>
              {vetoNames.length > 0 && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <X className="h-3 w-3" />
                  {vetoNames.join(', ')}
                </span>
              )}
            </div>
          </a>
        ))}
      </CardContent>
    </Card>
  );
}
