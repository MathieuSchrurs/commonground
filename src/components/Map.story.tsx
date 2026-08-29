import { useState } from 'react';
import Map from './Map';
import { PropertyListing } from '@/scraper/types';
import type { CommuteConstraint } from '@/types/user';
import type { ListingReaction, ReactionKind } from '@/types/reactions';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import type mapboxgl from 'mapbox-gl';

// Stable empty array — `users={[]}` inline in JSX would create a fresh array
// reference on every story render, which is exactly the reference-instability
// WithZones's regression test needs to *not* have on the props it isn't
// exercising, so a rebuild it detects is attributable only to
// isochrones/intersection.
const EMPTY_USERS: CommuteConstraint[] = [];

// Map's test-only `onMapInstance` hook, wired to the two globals map.spec.ts
// reads: the live map (for getSource/queryRenderedFeatures, since GL layers
// aren't DOM nodes a locator can find) and a count of 'idle' events, which is
// how a test knows the map has finished drawing before asserting on what is
// — and isn't — on it.
function recordMapForTest(map: mapboxgl.Map) {
  const w = window as unknown as { __mapForTest?: mapboxgl.Map; __mapIdleCount?: number };
  w.__mapForTest = map;
  w.__mapIdleCount = 0;
  map.on('idle', () => { w.__mapIdleCount = (w.__mapIdleCount ?? 0) + 1; });
}

// Listings clustered around Ghent, spread enough to be individually
// addressable but close enough that a real clustering pass (once #38 lands)
// would group most of them at low zoom — this story is the fixture for that
// story's regression test, not just today's uncapped-markers baseline.
// Exported so map.spec.ts asserts against this count rather than a second,
// independently-hardcoded literal that could drift from it.
export const LISTING_COUNT = 24;

function listing(i: number): PropertyListing {
  const angle = (i / LISTING_COUNT) * Math.PI * 2;
  return {
    id: `listing-${i}`,
    source: 'immoweb',
    external_id: String(i),
    url: `https://example.com/${i}`,
    property_type: 'house',
    price: 250000 + i * 1000,
    latitude: 51.0543 + Math.cos(angle) * 0.02,
    longitude: 3.7174 + Math.sin(angle) * 0.02,
  };
}

const properties = Array.from({ length: LISTING_COUNT }, (_, i) => listing(i));

// listing(0)'s coordinates — angle 0 puts it due "north" of the ring center,
// a fixed, known point map.spec.ts zooms/centers on to click a single
// unclustered pin reliably rather than guessing which of the 24 broke out of
// a cluster.
export const POPUP_TARGET_LISTING = listing(0);

// A search zone routinely holds well over a thousand listings (see
// src/scraper/db.ts) — this fixture is that scale, so map.spec.ts can assert
// the DOM-marker count doesn't track the listing count. Laid out as a tight
// grid (~840m × 890m around Ghent) rather than the wide ring above so the
// whole set fits the viewport at high zoom: that lets the clustering test
// compare "one cluster at low zoom" against "every listing individually" at
// high zoom without listings falling outside the queried viewport.
export const MANY_LISTING_COUNT = 1500;
const MANY_COLUMNS = 50;
const MANY_ROWS = MANY_LISTING_COUNT / MANY_COLUMNS;

function manyListing(i: number): PropertyListing {
  const column = i % MANY_COLUMNS;
  const row = Math.floor(i / MANY_COLUMNS);
  return {
    id: `many-listing-${i}`,
    source: 'immoweb',
    external_id: `many-${i}`,
    url: `https://example.com/many/${i}`,
    property_type: 'house',
    price: 200000 + i * 100,
    latitude: 51.0543 - 0.004 + (row / (MANY_ROWS - 1)) * 0.008,
    longitude: 3.7174 - 0.006 + (column / (MANY_COLUMNS - 1)) * 0.012,
  };
}

const manyProperties = Array.from({ length: MANY_LISTING_COUNT }, (_, i) => manyListing(i));

// myUserId is a story prop (not hardcoded like the others) specifically so
// map.spec.ts can exercise component.update({ myUserId }) — changing who's
// viewing is unrelated to which listings exist, so it's the natural probe
// for "does an unrelated prop change needlessly rebuild the marker layer".
export const Default = ({ myUserId = null }: { myUserId?: string | null } = {}) => (
  <div style={{ height: '600px', width: '100%' }}>
    <Map
      users={EMPTY_USERS}
      intersection={null}
      isochrones={[]}
      properties={properties}
      myUserId={myUserId}
      onMapInstance={recordMapForTest}
    />
  </div>
);

// Same component, at the scale a real search zone reaches. The listing pins
// are a clustered GeoJSON layer, which is canvas-rendered rather than DOM, so
// this story records the live map instance the same way WithZones does — the
// test asserts on queryRenderedFeatures, not on nodes it can select.
export const ManyListings = () => (
  <div style={{ height: '600px', width: '100%' }}>
    <Map
      users={EMPTY_USERS}
      intersection={null}
      isochrones={[]}
      properties={manyProperties}
      onMapInstance={recordMapForTest}
    />
  </div>
);

// Fixture for map.spec.ts's popup test: same 24-listing ring as Default, but
// with `reactions`/`onToggleReaction` wired to real story state instead of
// left at their defaults, so a click on the popup's love/object button is
// observable — the story records what it was called with (and the resulting
// reaction state) into a hidden form, per the "story owns the state" pattern.
export const WithReactions = ({ myUserId = 'me' }: { myUserId?: string | null } = {}) => {
  const [reactions, setReactions] = useState<ListingReaction[]>([]);
  const [lastToggle, setLastToggle] = useState('');

  const onToggleReaction = (listingId: string, reaction: ReactionKind) => {
    setLastToggle(`${listingId}:${reaction}`);
    setReactions(prev => {
      const mine = prev.find(r => r.listing_id === listingId && r.user_id === myUserId);
      if (mine) {
        return mine.reaction === reaction
          ? prev.filter(r => r !== mine)
          : prev.map(r => (r === mine ? { ...r, reaction } : r));
      }
      return [
        ...prev,
        { id: `${listingId}-${myUserId}`, session_id: 'story', listing_id: listingId, user_id: myUserId ?? '', reaction },
      ];
    });
  };

  return (
    <div style={{ height: '600px', width: '100%' }}>
      <Map
        users={EMPTY_USERS}
        intersection={null}
        isochrones={[]}
        properties={properties}
        reactions={reactions}
        myUserId={myUserId}
        onToggleReaction={onToggleReaction}
        onMapInstance={recordMapForTest}
      />
      <form hidden>
        <input data-testid="last-toggle-call" readOnly value={lastToggle} />
        <input
          data-testid="my-reaction"
          readOnly
          value={reactions.find(r => r.listing_id === POPUP_TARGET_LISTING.id && r.user_id === myUserId)?.reaction ?? ''}
        />
      </form>
    </div>
  );
};

// Two commute zones with a genuine overlap, and their overlap as the
// intersection — fixtures for map.spec.ts's regression test that an
// unrelated re-render (new-but-content-equal `isochrones`/`intersection`
// references, the exact shape the parent produces every render) doesn't
// tear down and rebuild the isochrone layer stack or re-`setData` the
// intersection source.
export const ISOCHRONE_FIXTURES: Feature<Polygon | MultiPolygon>[] = [
  {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[[3.70, 51.05], [3.74, 51.05], [3.74, 51.08], [3.70, 51.08], [3.70, 51.05]]],
    },
  },
  {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[[3.72, 51.04], [3.76, 51.04], [3.76, 51.07], [3.72, 51.07], [3.72, 51.04]]],
    },
  },
];

export const INTERSECTION_FIXTURE: Feature<Polygon | MultiPolygon> = {
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [[[3.72, 51.05], [3.74, 51.05], [3.74, 51.07], [3.72, 51.07], [3.72, 51.05]]],
  },
};

// Isochrone/intersection layers are canvas-rendered GL layers, not DOM
// nodes — map.spec.ts can't tag them the way it tags marker elements. This
// story instead records the live mapboxgl.Map instance on `window` via
// Map's test-only `onMapInstance` hook, so the test can call `getSource(...)`
// directly and compare object identity across an `update()`.
// `users` is a story prop (not fixed at EMPTY_USERS like the others) so
// map.spec.ts can probe the exact shape of the bug this story defends
// against: renaming a participant re-renders with a new `users` array
// reference but unchanged isochrones/intersection content — the intersection
// effect's no-overlap fallback branch reads `users`, so it's easy for that
// dependency to leak into the branch above it that must not re-`setData`.
export const WithZones = ({
  isochrones = ISOCHRONE_FIXTURES,
  intersection = INTERSECTION_FIXTURE,
  users = EMPTY_USERS,
}: {
  isochrones?: Feature<Polygon | MultiPolygon>[];
  intersection?: Feature<Polygon | MultiPolygon> | null;
  users?: CommuteConstraint[];
} = {}) => (
  <div style={{ height: '600px', width: '100%' }}>
    <Map
      users={users}
      intersection={intersection}
      isochrones={isochrones}
      properties={[]}
      onMapInstance={recordMapForTest}
    />
  </div>
);

// Two participants — fixture for map.spec.ts's regression test that an
// unrelated re-render (new-but-content-equal `users` reference, the exact
// shape the parent produces every render, e.g. via a household-pairing field
// changing) doesn't tear down and recreate participant markers keyed by
// identity.
export const PARTICIPANT_FIXTURES: CommuteConstraint[] = [
  {
    id: 'participant-1',
    name: 'Alex',
    address: 'Korenlei 1, Ghent',
    latitude: 51.0543,
    longitude: 3.7174,
    maxMinutes: 30,
    transportMode: 'driving',
  },
  {
    id: 'participant-2',
    name: 'Sam',
    address: 'Vrijdagmarkt 1, Ghent',
    latitude: 51.0570,
    longitude: 3.7250,
    maxMinutes: 25,
    transportMode: 'cycling',
  },
];

export const WithParticipants = ({ users = PARTICIPANT_FIXTURES }: { users?: CommuteConstraint[] } = {}) => (
  <div style={{ height: '600px', width: '100%' }}>
    <Map users={users} intersection={null} isochrones={[]} properties={[]} />
  </div>
);
