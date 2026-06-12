import { PropertyListing } from './types';

// Cross-source dedup. A property listed on multiple sites usually shows up
// with the same street address (when both sources include street+number) —
// that's the strongest signal. As a fallback we cluster by very-close
// coordinates + similar price + matching property_type.
//
// Source priority for which copy to keep: realo (precise street-level coords,
// rich data) > immoscoop (street addresses, images) > immoweb > immovlan
// (postcode-level only) > zimmo.
const SOURCE_RANK: Record<string, number> = { realo: 5, immoscoop: 4, immoweb: 3, immovlan: 2, zimmo: 1 };

export function streetKey(l: PropertyListing): string | null {
  if (!l.postal_code || !l.address) return null;
  // Normalize: lowercase, collapse whitespace, strip "belgium" suffix and punctuation
  const cleaned = l.address
    .toLowerCase()
    .replace(/,?\s*belgium\s*$/i, '')
    .replace(/[.,;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `${l.postal_code}:${cleaned}`;
}

export function metersBetween(a: PropertyListing, b: PropertyListing): number {
  if (!a.latitude || !a.longitude || !b.latitude || !b.longitude) return Infinity;
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function priceClose(a?: number, b?: number): boolean {
  if (!a || !b) return false;
  return Math.abs(a - b) / Math.max(a, b) <= 0.02; // within 2%
}

const pickBest = (cluster: PropertyListing[]) =>
  cluster.reduce((best, cur) =>
    (SOURCE_RANK[cur.source] ?? 0) > (SOURCE_RANK[best.source] ?? 0) ? cur : best
  );

export function dedupeAcrossSources(
  listings: PropertyListing[]
): { listings: PropertyListing[]; merged: number } {
  // Group by street key first
  const byStreet = new Map<string, PropertyListing[]>();
  const noStreetKey: PropertyListing[] = [];
  for (const l of listings) {
    const k = streetKey(l);
    if (k) {
      const arr = byStreet.get(k) ?? [];
      arr.push(l);
      byStreet.set(k, arr);
    } else {
      noStreetKey.push(l);
    }
  }

  const canonical: PropertyListing[] = [];
  let merged = 0;

  for (const cluster of byStreet.values()) {
    if (cluster.length > 1) merged += cluster.length - 1;
    canonical.push(pickBest(cluster));
  }

  // For listings without a street key, do a geo+price pass (catches cases
  // where both sources have coords but only one has an address).
  const usedIdx = new Set<number>();
  for (let i = 0; i < noStreetKey.length; i++) {
    if (usedIdx.has(i)) continue;
    const cluster: PropertyListing[] = [noStreetKey[i]];
    usedIdx.add(i);
    for (let j = i + 1; j < noStreetKey.length; j++) {
      if (usedIdx.has(j)) continue;
      const a = noStreetKey[i];
      const b = noStreetKey[j];
      // Postcode-centroid coordinates stack unrelated listings on the same
      // point — never merge on proximity unless both locations are exact.
      if (a.location_precision === 'approximate' || b.location_precision === 'approximate') continue;
      if (
        a.property_type === b.property_type &&
        metersBetween(a, b) < 15 &&
        priceClose(a.price, b.price)
      ) {
        cluster.push(b);
        usedIdx.add(j);
      }
    }
    if (cluster.length > 1) merged += cluster.length - 1;
    canonical.push(pickBest(cluster));
  }

  return { listings: canonical, merged };
}
