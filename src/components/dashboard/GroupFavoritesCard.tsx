'use client';

import React from 'react';
import { ExternalLink, Heart, Star, X } from 'lucide-react';
import { Favorite } from '@/lib/favorites';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface GroupFavoritesCardProps {
  favorites: Favorite[];
}

function formatPrice(price?: number): string {
  if (!price) return 'Price on request';
  return `€${price.toLocaleString('nl-BE')}`;
}

// The houses the group has converged on, ranked by hearts. Mirrors the map's
// Shortlist but lives on the dashboard so it's visible without the map open.
export default function GroupFavoritesCard({ favorites }: GroupFavoritesCardProps) {
  // The interesting signal is shared enthusiasm — surface multi-person loves first.
  const shared = favorites.filter((f) => f.loveCount >= 2);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Star className="h-4 w-4" />
          Group favorites
        </CardTitle>
        <span className="text-xs font-mono tabular-nums text-muted-foreground">{shared.length}</span>
      </CardHeader>
      <CardContent className="space-y-2">
        {shared.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing loved by more than one person yet. Heart houses on the map and the group&apos;s
            shared picks show up here.
          </p>
        ) : (
          shared.map(({ listing, loveCount, loveNames, vetoNames, unanimous }) => (
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
                    everyone
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1">
                    <Heart className="h-3 w-3 fill-current text-rose-600" />
                    {loveCount}
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
          ))
        )}
      </CardContent>
    </Card>
  );
}
