'use client';

import React, { useMemo } from 'react';
import { ExternalLink, Heart, MessageCircleWarning } from 'lucide-react';
import { PropertyListing } from '@/scraper/types';
import { ListingReaction } from '@/types/reactions';
import { CommuteConstraint } from '@/types/user';
import { computeConvergence, Household } from '@/lib/convergence';
import { isListingVisible } from '@/lib/listings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import HouseholdStandings from '@/components/dashboard/HouseholdStandings';

interface ShortlistPanelProps {
  properties: PropertyListing[];
  reactions: ListingReaction[];
  users: CommuteConstraint[];
  households?: Household[];
  /** session_user id of the person at this browser; null until they pick */
  myUserId?: string | null;
}

function formatPrice(price?: number): string {
  if (!price) return 'Price on request';
  return `€${price.toLocaleString('nl-BE')}`;
}

// The map's convergence view, reading the same household positions as the
// dashboard so the two surfaces can never disagree about what the group
// thinks. Converging houses first, then the ones still being argued over.
export default function ShortlistPanel({
  properties,
  reactions,
  users,
  households = [],
  myUserId = null,
}: ShortlistPanelProps) {
  // Defaults to hidden (matches the DB default on session_users) when the
  // viewer's own hideCommercial isn't set — see docs/adr/0004.
  const hideCommercial = useMemo(
    () => users.find((u) => u.id === myUserId)?.hideCommercial ?? true,
    [users, myUserId]
  );

  const shortlist = useMemo(() => {
    const visibleProperties = properties.filter((p) => isListingVisible(p, hideCommercial));
    const { considered, contested } = computeConvergence({
      listings: visibleProperties,
      reactions,
      participants: users,
      households,
    });
    // Everything anyone wants, not just what has reached favorite status — a
    // house the group is still warming to must not vanish off the map.
    const arguing = new Set(contested.map((e) => e.listing.id));
    return considered.map((entry) => ({ entry, contested: arguing.has(entry.listing.id) }));
  }, [properties, reactions, users, households, hideCommercial]);

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
        {shortlist.map(({ entry: { listing, standings, yesCount, unanimous }, contested }) => (
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
              {unanimous ? (
                <Badge className="gap-1 bg-amber-500 text-white hover:bg-amber-500">
                  <Heart className="h-3 w-3 fill-current" />
                  every household
                </Badge>
              ) : contested ? (
                <Badge variant="secondary" className="gap-1">
                  <MessageCircleWarning className="h-3 w-3" />
                  {yesCount} of {standings.length}
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <Heart className="h-3 w-3 fill-current text-rose-600" />
                  {yesCount} of {standings.length}
                </Badge>
              )}
              <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="text-xs text-muted-foreground truncate mt-0.5">
              {listing.address ?? listing.city ?? listing.title ?? listing.url}
            </div>
            <HouseholdStandings standings={standings} />
          </a>
        ))}
      </CardContent>
    </Card>
  );
}
