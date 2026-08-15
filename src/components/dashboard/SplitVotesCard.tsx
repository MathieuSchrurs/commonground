'use client';

import React from 'react';
import { ExternalLink, MessageCircleWarning } from 'lucide-react';
import { ListingConvergence } from '@/lib/convergence';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import HouseholdStandings from './HouseholdStandings';

interface SplitVotesCardProps {
  contested: ListingConvergence[];
}

function formatPrice(price?: number): string {
  if (!price) return 'Price on request';
  return `€${price.toLocaleString('nl-BE')}`;
}

// Houses with an objection still standing, closest to consensus first — so the
// top row is the debate most worth having. An objection is an opening position,
// not a kill: these houses stay alive until the group decides otherwise.
export default function SplitVotesCard({ contested }: SplitVotesCardProps) {
  return (
    <Card className="ring-1 ring-foreground/20">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageCircleWarning className="h-4 w-4" />
          To talk about
        </CardTitle>
        <span className="text-xs font-mono tabular-nums text-muted-foreground">
          {contested.length}
        </span>
      </CardHeader>
      <CardContent className="space-y-2">
        {contested.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No objections outstanding — everyone who&apos;s reacted is on the same page.
          </p>
        ) : (
          contested.map(({ listing, standings, yesCount }) => (
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
                <Badge variant="secondary" className="gap-1">
                  {yesCount} of {standings.length} in
                </Badge>
                <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="text-xs text-muted-foreground truncate mt-0.5">
                {listing.address ?? listing.city ?? listing.title ?? listing.url}
              </div>
              <HouseholdStandings standings={standings} />
            </a>
          ))
        )}
      </CardContent>
    </Card>
  );
}
