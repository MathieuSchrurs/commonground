// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ShortlistPanel from './ShortlistPanel';
import { PropertyListing } from '@/scraper/types';
import { ListingReaction } from '@/types/reactions';
import { CommuteConstraint } from '@/types/user';

function listing(id: string, property_type: PropertyListing['property_type']): PropertyListing {
  return { id, source: 'immoweb', external_id: id, url: `https://example.com/${id}`, property_type };
}

function reaction(id: string, listing_id: string, user_id: string): ListingReaction {
  return { id, session_id: 's1', listing_id, user_id, reaction: 'love' };
}

function participant(id: string, hideCommercial?: boolean): CommuteConstraint {
  return {
    id,
    name: id,
    address: 'x',
    latitude: 0,
    longitude: 0,
    maxMinutes: 30,
    transportMode: 'driving',
    hideCommercial,
  };
}

describe('ShortlistPanel — commercial-listing visibility', () => {
  it("hides a commercial listing the viewer has toggled off, without hiding it for other viewers' data", () => {
    const properties = [listing('house-1', 'house'), listing('office-1', 'commercial')];
    const reactions = [reaction('r1', 'house-1', 'me'), reaction('r2', 'office-1', 'me')];
    const users = [participant('me', true)]; // hides commercial

    render(<ShortlistPanel properties={properties} reactions={reactions} users={users} myUserId="me" />);

    // The non-commercial listing the viewer reacted to is shown...
    expect(screen.getByText('Price on request')).toBeInTheDocument();
    // ...but the commercial one, hidden by this viewer's own preference, is not.
    expect(screen.queryAllByRole('link')).toHaveLength(1);
  });

  it('shows a commercial listing, with correct standings, when the viewer has not hidden it', () => {
    const properties = [listing('office-1', 'commercial')];
    const reactions = [reaction('r1', 'office-1', 'me'), reaction('r2', 'office-1', 'partner')];
    const users = [participant('me', false), participant('partner', false)];

    render(<ShortlistPanel properties={properties} reactions={reactions} users={users} myUserId="me" />);

    expect(screen.getAllByRole('link')).toHaveLength(1);
    // Two households, both yes — "every household".
    expect(screen.getByText('every household')).toBeInTheDocument();
  });

  it('never hides a non-commercial listing regardless of the preference', () => {
    const properties = [listing('house-1', 'house')];
    const reactions = [reaction('r1', 'house-1', 'me')];
    const users = [participant('me', true)];

    render(<ShortlistPanel properties={properties} reactions={reactions} users={users} myUserId="me" />);

    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('renders nothing when there is no shortlist', () => {
    const { container } = render(
      <ShortlistPanel properties={[]} reactions={[]} users={[]} myUserId={null} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
