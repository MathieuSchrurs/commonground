'use client';

import React from 'react';
import { ExternalLink, Heart, Star } from 'lucide-react';
import { ListingConvergence } from '@/lib/convergence';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import HouseholdStandings from './HouseholdStandings';

interface GroupFavoritesCardProps {
  favorites: ListingConvergence[];
}

function formatPrice(price?: number): string {
  if (!price) return 'Price on request';
  return `€${price.toLocaleString('nl-BE')}`;
}

// Where the group is converging: houses two or more households want and nobody
// has objected to. Anything with a standing objection lives in the contested
// card instead — the two never show the same house.
export default function GroupFavoritesCard({ favorites }: GroupFavoritesCardProps) {
  return (
    <Card className="ring-1 ring-foreground/20">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Star className="h-4 w-4" />
          Group favorites
        </CardTitle>
        <span className="text-xs font-mono tabular-nums text-muted-foreground">
          {favorites.length}
        </span>
      </CardHeader>
      <CardContent className="space-y-2">
        {favorites.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing more than one household wants yet. Heart houses on the map and the group&apos;s
            shared picks show up here.
          </p>
        ) : (
          favorites.map(({ listing, standings, yesCount, unanimous }) => (
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
                {unanimous ? (
                  <Badge className="gap-1 bg-amber-500 text-white hover:bg-amber-500">
                    <Heart className="h-3 w-3 fill-current" />
                    every household
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
          ))
        )}
      </CardContent>
    </Card>
  );
}
