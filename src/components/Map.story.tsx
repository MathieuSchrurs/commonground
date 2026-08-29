import Map from './Map';
import { PropertyListing } from '@/scraper/types';

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
