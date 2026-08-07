import { describe, expect, it } from 'vitest';
import { computeConvergence, listingsAwaiting, Convergence } from './convergence';
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
  reaction: 'love' | 'object',
): ListingReaction {
  return { id: `${listing_id}-${user_id}`, session_id: 's', listing_id, user_id, reaction };
}

// Three couples: six participants, three households.
const households = [
  { id: 'h1', name: 'Anna & Tom' },
  { id: 'h2', name: 'Bea & Cas' },
  { id: 'h3', name: 'Eva & Finn' },
];

const participants = [
  { id: 'u1', name: 'Anna', householdId: 'h1' },
  { id: 'u2', name: 'Tom', householdId: 'h1' },
  { id: 'u3', name: 'Bea', householdId: 'h2' },
  { id: 'u4', name: 'Cas', householdId: 'h2' },
  { id: 'u5', name: 'Eva', householdId: 'h3' },
  { id: 'u6', name: 'Finn', householdId: 'h3' },
];

// Where a listing lands is a separate concern from what each household thinks
// of it, so position tests look it up across both sets.
function positionOf(result: Convergence, listingId: string, householdId: string) {
  const entry = result.engaged.find((e) => e.listing.id === listingId);
  return entry?.standings.find((s) => s.householdId === householdId)?.position;
}

describe('computeConvergence', () => {
  it('makes a listing two households love a favorite', () => {
    const { favorites } = computeConvergence({
      listings: [listing('a')],
      reactions: [
        reaction('a', 'u1', 'love'),
        reaction('a', 'u2', 'love'),
        reaction('a', 'u3', 'love'),
        reaction('a', 'u4', 'love'),
      ],
      participants,
      households,
    });

    expect(favorites.map((f) => f.listing.id)).toEqual(['a']);
    expect(favorites[0].yesCount).toBe(2);
  });

  it('reads a household as split when one partner loves and the other objects', () => {
    const result = computeConvergence({
      listings: [listing('a')],
      reactions: [reaction('a', 'u1', 'love'), reaction('a', 'u2', 'object')],
      participants,
      households,
    });

    expect(positionOf(result, 'a', 'h1')).toBe('split');
  });

  it('reads a household as no when one partner objects and the other is silent', () => {
    const result = computeConvergence({
      listings: [listing('a')],
      reactions: [reaction('a', 'u1', 'love'), reaction('a', 'u3', 'object')],
      participants,
      households,
    });

    expect(positionOf(result, 'a', 'h2')).toBe('no');
  });

  it('reads a household as yes when one partner loves and the other is silent', () => {
    const result = computeConvergence({
      listings: [listing('a')],
      reactions: [reaction('a', 'u1', 'love')],
      participants,
      households,
    });

    expect(positionOf(result, 'a', 'h1')).toBe('yes');
  });

  it('reads a household as silent when neither partner has reacted', () => {
    const result = computeConvergence({
      listings: [listing('a')],
      reactions: [reaction('a', 'u1', 'love')],
      participants,
      households,
    });

    expect(positionOf(result, 'a', 'h3')).toBe('silent');
  });

  it('flips a household from yes to split when the second partner objects', () => {
    const input = {
      listings: [listing('a')],
      participants,
      households,
    };

    const before = computeConvergence({ ...input, reactions: [reaction('a', 'u1', 'love')] });
    expect(positionOf(before, 'a', 'h1')).toBe('yes');

    const after = computeConvergence({
      ...input,
      reactions: [reaction('a', 'u1', 'love'), reaction('a', 'u2', 'object')],
    });
    expect(positionOf(after, 'a', 'h1')).toBe('split');
  });

  it('routes a listing with a standing objection to contested, never to favorites', () => {
    const result = computeConvergence({
      listings: [listing('a')],
      reactions: [
        reaction('a', 'u1', 'love'), // h1 yes
        reaction('a', 'u2', 'love'),
        reaction('a', 'u3', 'love'), // h2 yes
        reaction('a', 'u4', 'love'),
        reaction('a', 'u5', 'object'), // h3 no
      ],
      participants,
      households,
    });

    expect(result.contested.map((e) => e.listing.id)).toEqual(['a']);
    expect(result.favorites).toEqual([]);
  });

  it('treats a participant belonging to no household as a household of one', () => {
    const result = computeConvergence({
      listings: [listing('a')],
      reactions: [reaction('a', 'u1', 'love'), reaction('a', 'u2', 'love')],
      participants: [
        { id: 'u1', name: 'Anna' },
        { id: 'u2', name: 'Tom' },
      ],
      households: [],
    });

    expect(result.favorites.map((f) => f.listing.id)).toEqual(['a']);
    expect(result.favorites[0].yesCount).toBe(2);
  });

  it('flags unanimous only when every household is yes and none is silent', () => {
    const base = { listings: [listing('a')], participants, households };

    const everyone = computeConvergence({
      ...base,
      reactions: participants.map((p) => reaction('a', p.id, 'love')),
    });
    expect(everyone.favorites[0].unanimous).toBe(true);

    const oneSilent = computeConvergence({
      ...base,
      reactions: [
        reaction('a', 'u1', 'love'),
        reaction('a', 'u3', 'love'),
        // h3 never reacts
      ],
    });
    expect(oneSilent.favorites[0].unanimous).toBe(false);
  });

  it('ranks contested listings by closeness to consensus', () => {
    const result = computeConvergence({
      listings: [listing('a'), listing('b')],
      reactions: [
        // a: one household in, one objecting
        reaction('a', 'u1', 'love'),
        reaction('a', 'u3', 'object'),
        // b: two households in, one objecting — closer to a decision
        reaction('b', 'u1', 'love'),
        reaction('b', 'u3', 'love'),
        reaction('b', 'u5', 'object'),
      ],
      participants,
      households,
    });

    expect(result.contested.map((e) => e.listing.id)).toEqual(['b', 'a']);
  });

  it('does not claim unanimity in a single-household session', () => {
    const result = computeConvergence({
      listings: [listing('a')],
      reactions: [reaction('a', 'u1', 'love'), reaction('a', 'u2', 'love')],
      participants: participants.slice(0, 2),
      households: [households[0]],
    });

    expect(result.engaged[0].unanimous).toBe(false);
  });

  it('does not treat a listing nobody wants as something to talk about', () => {
    const result = computeConvergence({
      listings: [listing('a')],
      reactions: [reaction('a', 'u1', 'object')],
      participants,
      households,
    });

    // Objecting is how you prune the map. Pruning is not a debate.
    expect(result.contested).toEqual([]);
    expect(result.favorites).toEqual([]);
    expect(result.engaged.map((e) => e.listing.id)).toEqual(['a']);
  });

  it('still contests a listing whose only household is split', () => {
    const result = computeConvergence({
      listings: [listing('a')],
      reactions: [reaction('a', 'u1', 'love'), reaction('a', 'u2', 'object')],
      participants,
      households,
    });

    // No household is yes, but somebody wants it — that is a real argument.
    expect(result.contested.map((e) => e.listing.id)).toEqual(['a']);
    expect(result.contested[0].yesCount).toBe(0);
  });

  it('ignores a household nobody belongs to', () => {
    const result = computeConvergence({
      listings: [listing('a')],
      reactions: [
        reaction('a', 'u1', 'love'),
        reaction('a', 'u3', 'love'),
        reaction('a', 'u5', 'love'),
      ],
      participants,
      // A household whose members have all left the session is not a decider:
      // left in, it could never be yes, so unanimity would be unreachable.
      households: [...households, { id: 'h4', name: 'Departed' }],
    });

    expect(result.favorites[0].standings).toHaveLength(3);
    expect(result.favorites[0].unanimous).toBe(true);
  });

  it('considers a listing one household loves, even though it is not yet a favorite', () => {
    const result = computeConvergence({
      listings: [listing('a'), listing('b')],
      reactions: [
        reaction('a', 'u1', 'love'), // wanted by one household, nothing against
        reaction('b', 'u3', 'object'), // nobody wants it
      ],
      participants,
      households,
    });

    // The map's shortlist shows everything anyone wants; the dashboard's
    // favorites card is stricter. Neither should lose this house entirely.
    expect(result.considered.map((e) => e.listing.id)).toEqual(['a']);
    expect(result.favorites).toEqual([]);
    expect(result.contested).toEqual([]);
  });

  it('names who loves and who objects inside each household', () => {
    const result = computeConvergence({
      listings: [listing('a')],
      reactions: [reaction('a', 'u1', 'love'), reaction('a', 'u2', 'object')],
      participants,
      households,
    });

    const h1 = result.engaged[0].standings.find((s) => s.householdId === 'h1');
    expect(h1?.loveNames).toEqual(['Anna']);
    expect(h1?.objectNames).toEqual(['Tom']);
  });

  it('keeps a listing only one household loves out of favorites', () => {
    const result = computeConvergence({
      listings: [listing('a')],
      reactions: [reaction('a', 'u1', 'love'), reaction('a', 'u2', 'love')],
      participants,
      households,
    });

    expect(result.favorites).toEqual([]);
    expect(result.engaged.map((e) => e.listing.id)).toEqual(['a']);
  });

  it('returns empty sets when nobody has reacted', () => {
    const result = computeConvergence({
      listings: [listing('a'), listing('b')],
      reactions: [],
      participants,
      households,
    });

    expect(result).toEqual({ engaged: [], considered: [], favorites: [], contested: [] });
  });

  // The deploy-day safety property: households land as a nullable column, so
  // every existing participant starts unpaired. Nothing may change until
  // someone actually pairs up.
  it('reproduces person-level behaviour when nobody is paired yet', () => {
    const unpaired = participants.map(({ id, name }) => ({ id, name }));
    const input = { participants: unpaired, households: [] };

    const twoLoves = computeConvergence({
      ...input,
      listings: [listing('a')],
      reactions: [reaction('a', 'u1', 'love'), reaction('a', 'u2', 'love')],
    });
    expect(twoLoves.favorites.map((f) => f.listing.id)).toEqual(['a']);

    const oneLove = computeConvergence({
      ...input,
      listings: [listing('a')],
      reactions: [reaction('a', 'u1', 'love')],
    });
    expect(oneLove.favorites).toEqual([]);

    const objectedTo = computeConvergence({
      ...input,
      listings: [listing('a')],
      reactions: [
        reaction('a', 'u1', 'love'),
        reaction('a', 'u2', 'love'),
        reaction('a', 'u3', 'object'),
      ],
    });
    expect(objectedTo.contested.map((e) => e.listing.id)).toEqual(['a']);
    expect(objectedTo.favorites).toEqual([]);
  });
});

describe('listingsAwaiting', () => {
  const base = { participants, households };

  it('lists what a household has not weighed in on', () => {
    const result = computeConvergence({
      ...base,
      listings: [listing('a'), listing('b')],
      reactions: [
        reaction('a', 'u1', 'love'), // h1 wants it, h3 silent
        reaction('b', 'u1', 'love'),
        reaction('b', 'u5', 'love'), // h3 has spoken on b
      ],
    });

    expect(listingsAwaiting(result, 'h3').map((e) => e.listing.id)).toEqual(['a']);
  });

  it('drops a listing once anyone in the household reacts', () => {
    const withSilence = computeConvergence({
      ...base,
      listings: [listing('a')],
      reactions: [reaction('a', 'u1', 'love')],
    });
    expect(listingsAwaiting(withSilence, 'h3')).toHaveLength(1);

    // Either partner speaking is enough — silence never blocks.
    const afterPartner = computeConvergence({
      ...base,
      listings: [listing('a')],
      reactions: [reaction('a', 'u1', 'love'), reaction('a', 'u6', 'object')],
    });
    expect(listingsAwaiting(afterPartner, 'h3')).toEqual([]);
  });

  it('does not ask about houses nobody wants', () => {
    const result = computeConvergence({
      ...base,
      listings: [listing('a')],
      reactions: [reaction('a', 'u1', 'object')],
    });

    // Pruned, not pending — nothing is waiting on anyone here.
    expect(listingsAwaiting(result, 'h3')).toEqual([]);
  });
});
