import { describe, expect, it } from 'vitest';
import { computeFavorites, computeSplitVotes } from './favorites';
import { PropertyListing } from '@/scraper/types';
import { ListingReaction } from '@/types/reactions';

function listing(id: string): PropertyListing {
  return {
    id,
    source: 'realo',
    external_id: id,
    url: `https://example.com/${id}`,
  } as PropertyListing;
}

function reaction(
  listing_id: string,
  user_id: string,
  reaction: 'love' | 'veto',
): ListingReaction {
  return { id: `${listing_id}-${user_id}`, session_id: 's', listing_id, user_id, reaction };
}

const users = [
  { id: 'u1', name: 'Anna' },
  { id: 'u2', name: 'Tom' },
  { id: 'u3', name: 'Bea' },
];

describe('computeFavorites', () => {
  it('keeps only listings loved by at least one person', () => {
    const result = computeFavorites(
      [listing('a'), listing('b')],
      [reaction('a', 'u1', 'love'), reaction('b', 'u1', 'veto')],
      users,
    );
    expect(result.map((f) => f.listing.id)).toEqual(['a']);
  });

  it('ranks by love count, most-loved first', () => {
    const result = computeFavorites(
      [listing('a'), listing('b')],
      [
        reaction('a', 'u1', 'love'),
        reaction('b', 'u1', 'love'),
        reaction('b', 'u2', 'love'),
      ],
      users,
    );
    expect(result.map((f) => f.listing.id)).toEqual(['b', 'a']);
    expect(result[0].loveCount).toBe(2);
  });

  it('flags a listing as unanimous only when everyone loves it', () => {
    const result = computeFavorites(
      [listing('a')],
      [
        reaction('a', 'u1', 'love'),
        reaction('a', 'u2', 'love'),
        reaction('a', 'u3', 'love'),
      ],
      users,
    );
    expect(result[0].unanimous).toBe(true);
    expect(result[0].loveNames).toEqual(['Anna', 'Tom', 'Bea']);
  });

  it('is not unanimous with a single user', () => {
    const result = computeFavorites(
      [listing('a')],
      [reaction('a', 'u1', 'love')],
      [users[0]],
    );
    expect(result[0].unanimous).toBe(false);
  });

  it('reports veto names alongside loves', () => {
    const result = computeFavorites(
      [listing('a')],
      [reaction('a', 'u1', 'love'), reaction('a', 'u2', 'veto')],
      users,
    );
    expect(result[0].loveNames).toEqual(['Anna']);
    expect(result[0].vetoNames).toEqual(['Tom']);
  });
});

describe('computeSplitVotes', () => {
  it('returns only houses loved by some and vetoed by others', () => {
    const favorites = computeFavorites(
      [listing('a'), listing('b')],
      [
        reaction('a', 'u1', 'love'),
        reaction('a', 'u2', 'veto'),
        reaction('b', 'u1', 'love'),
        reaction('b', 'u2', 'love'),
      ],
      users,
    );
    const splits = computeSplitVotes(favorites);
    expect(splits.map((f) => f.listing.id)).toEqual(['a']);
  });

  it('keeps the order given and returns an empty list when everyone agrees', () => {
    const favorites = computeFavorites(
      [listing('a'), listing('b')],
      [
        reaction('a', 'u1', 'love'),
        reaction('a', 'u2', 'love'),
        reaction('b', 'u1', 'love'),
        reaction('b', 'u2', 'veto'),
      ],
      users,
    );
    expect(computeSplitVotes(favorites).map((f) => f.listing.id)).toEqual(['b']);
    expect(computeSplitVotes([])).toEqual([]);
  });
});
