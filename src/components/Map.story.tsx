import Map from './Map';
import { PropertyListing } from '@/scraper/types';
import type { CommuteConstraint } from '@/types/user';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import type mapboxgl from 'mapbox-gl';

// Stable empty array — `users={[]}` inline in JSX would create a fresh array
// reference on every story render, which is exactly the reference-instability
// WithZones's regression test needs to *not* have on the props it isn't
// exercising, so a rebuild it detects is attributable only to
// isochrones/intersection.
const EMPTY_USERS: CommuteConstraint[] = [];

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

// myUserId is a story prop (not hardcoded like the others) specifically so
// map.spec.ts can exercise component.update({ myUserId }) — changing who's
// viewing is unrelated to which listings exist, so it's the natural probe
// for "does an unrelated prop change needlessly rebuild the marker layer".
export const Default = ({ myUserId = null }: { myUserId?: string | null } = {}) => (
  <div style={{ height: '600px', width: '100%' }}>
    <Map users={[]} intersection={null} isochrones={[]} properties={properties} myUserId={myUserId} />
  </div>
);

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
export const WithZones = ({
  isochrones = ISOCHRONE_FIXTURES,
  intersection = INTERSECTION_FIXTURE,
}: {
  isochrones?: Feature<Polygon | MultiPolygon>[];
  intersection?: Feature<Polygon | MultiPolygon> | null;
} = {}) => (
  <div style={{ height: '600px', width: '100%' }}>
    <Map
      users={EMPTY_USERS}
      intersection={intersection}
      isochrones={isochrones}
      properties={[]}
      onMapInstance={(map) => {
        (window as unknown as { __mapForTest?: mapboxgl.Map }).__mapForTest = map;
      }}
    />
  </div>
);
