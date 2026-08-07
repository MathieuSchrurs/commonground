'use client';

import React from 'react';
import { ExternalLink, Heart, MessageCircleWarning, X } from 'lucide-react';
import { Favorite } from '@/lib/favorites';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface SplitVotesCardProps {
  splits: Favorite[];
}

function formatPrice(price?: number): string {
  if (!price) return 'Price on request';
  return `€${price.toLocaleString('nl-BE')}`;
}

// Houses the group disagrees on: someone loves it, someone objects. This is
// the signal that drives the conversation, so it gets its own card on the
// dashboard rather than a line inside group favorites.
export default function SplitVotesCard({ splits }: SplitVotesCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageCircleWarning className="h-4 w-4" />
          To talk about
        </CardTitle>
        <span className="text-xs font-mono tabular-nums text-muted-foreground">{splits.length}</span>
      </CardHeader>
      <CardContent className="space-y-2">
        {splits.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No disagreements yet — everyone who&apos;s reacted is on the same page.
          </p>
        ) : (
          splits.map(({ listing, loveNames, objectNames }) => (
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
                <span className="flex items-center gap-1 text-muted-foreground">
                  <X className="h-3 w-3" />
                  {objectNames.join(', ')}
                </span>
              </div>
            </a>
          ))
        )}
      </CardContent>
    </Card>
  );
}
