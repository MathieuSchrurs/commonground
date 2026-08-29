'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Feature, FeatureCollection, Point, Polygon, MultiPolygon } from 'geojson';
import { Eye, Layers, Loader2 } from 'lucide-react';
import { CommuteConstraint } from '@/types/user';
import { PropertyListing } from '@/scraper/types';
import { ListingReaction, ReactionKind } from '@/types/reactions';
import { passesListingFilters, resolveHideCommercial } from '@/lib/listings';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';

interface MapProps {
  users: CommuteConstraint[];
  intersection: Feature<Polygon | MultiPolygon> | null;
  isochrones: Feature<Polygon | MultiPolygon>[];
  properties?: PropertyListing[];
  isLoading?: boolean;
  reactions?: ListingReaction[];
  /** session_user id of the person at this browser; null until they pick */
  myUserId?: string | null;
  /** `source:external_id` keys of listings that appeared since the last visit */
  newListingKeys?: Set<string>;
  /** ids of listings every household is yes on — computed from convergence, so
   *  a couple's two hearts count once rather than twice */
  unanimousListingIds?: Set<string>;
  /** love/object handler for the listing popup, wired to its buttons. */
  onToggleReaction?: (listingId: string, reaction: ReactionKind) => void;
  /** test-only hook: called once with the live mapboxgl.Map instance after
   *  'load', so component tests can assert on layer/source identity across
   *  prop updates without instrumenting Map.tsx further */
  onMapInstance?: (map: mapboxgl.Map) => void;
}

interface LayerVisibility {
  markers: boolean[];
  isochrones: boolean[];
  intersection: boolean;
  properties: boolean;
}

const COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#96CEB4',
  '#FFEAA7',
  '#DDA0DD',
  '#98D8C8',
  '#F7DC6F',
];

const SOURCE_COLORS: Record<string, string> = {
  immoweb: '#e85c0d',
  zimmo: '#2563eb',
  realo: '#7c3aed',
  immovlan: '#16a34a',
  immoscoop: '#0e7490',
};

// Listings render as one clustered GeoJSON source, not one DOM node each: a
// single search zone routinely holds 1000+ listings (src/scraper/db.ts), and
// a marker per listing means that many DOM nodes re-projected on every pan.
const LISTINGS_SOURCE = 'listings';
const LISTINGS_HALO_LAYER = 'listings-halo';
const LISTINGS_POINT_LAYER = 'listings-unclustered';
const LISTINGS_CLUSTER_LAYER = 'listings-clusters';
const LISTINGS_CLUSTER_COUNT_LAYER = 'listings-cluster-count';
const LISTINGS_LAYERS = [
  LISTINGS_HALO_LAYER,
  LISTINGS_POINT_LAYER,
  LISTINGS_CLUSTER_LAYER,
  LISTINGS_CLUSTER_COUNT_LAYER,
];

// A listing's group opinion and freshness used to be inline styles on its own
// DOM node. With no per-listing node left, they travel as feature properties
// and are read back by data-driven paint expressions on the layers below.
interface ListingFeatureProperties {
  listingKey: string;
  color: string;
  approximate: boolean;
  objected: boolean;
  loved: boolean;
  lovedByAll: boolean;
  isNew: boolean;
}

const EMPTY_LISTINGS: FeatureCollection<Point, ListingFeatureProperties> = {
  type: 'FeatureCollection',
  features: [],
};

// Default for the `reactions` prop. A literal default would build a fresh
// array on every render, which would re-`setData` the listing source on every
// render of the parent — the same reference-vs-content trap the isochrone
// effects hit.
const NO_REACTIONS: ListingReaction[] = [];

function formatPrice(price?: number): string {
  if (!price) return 'Price on request';
  return `€${price.toLocaleString('nl-BE')}`;
}

// The listing popup's DOM, built once per click. Unlike the deleted
// per-marker version, there's no persistent node to mutate in place, so this
// is a plain function of a listing rather than a closure over one — the
// reactions row is a separate, empty container the caller fills in (and
// refills, on reaction/identity change) via `renderListingReactions` below.
// `isNew` travels as a parameter (not read off `listing`) because freshness
// is a function of `newListingKeys`, computed by the caller from a ref.
function buildListingPopupContent(listing: PropertyListing, isNew: boolean): { root: HTMLDivElement; reactionsEl: HTMLDivElement } {
  const root = document.createElement('div');
  root.className = 'listing-popup';
  root.style.cssText = 'max-width:220px;font-family:sans-serif;';

  const dropped = listing.previous_price != null && listing.price != null
    && listing.previous_price !== listing.price;
  const priceChangeHtml = dropped
    ? `<span style="color:${listing.price! < listing.previous_price! ? '#16a34a' : '#dc2626'};font-size:11px;font-weight:600;margin-left:6px;">${listing.price! < listing.previous_price! ? '↓' : '↑'} was ${formatPrice(listing.previous_price!)}</span>`
    : '';
  const daysOnMarket = listing.first_seen_at
    ? Math.max(0, Math.floor((Date.now() - Date.parse(listing.first_seen_at)) / 86400000))
    : null;
  const approximate = listing.location_precision === 'approximate';

  root.innerHTML = `
    ${listing.image_url ? `<img src="${listing.image_url}" style="width:100%;height:110px;object-fit:cover;border-radius:4px;margin-bottom:8px;" />` : ''}
    <div style="font-weight:700;font-size:14px;margin-bottom:4px;">
      ${formatPrice(listing.price)}
      ${priceChangeHtml}
      ${isNew ? '<span style="background:#2563eb;color:white;font-size:9px;font-weight:700;padding:2px 5px;border-radius:99px;vertical-align:middle;margin-left:6px;">NEW</span>' : ''}
    </div>
    ${daysOnMarket !== null ? `<div style="font-size:10px;color:#888;margin-bottom:4px;">${daysOnMarket === 0 ? 'First seen today' : `${daysOnMarket} day${daysOnMarket === 1 ? '' : 's'} on the market`}</div>` : ''}
    ${approximate ? '<div style="font-size:10px;color:#b45309;margin-bottom:4px;">⌖ Approximate location (postcode area) — check the listing for the real address</div>' : ''}
    ${listing.title ? `<div style="font-size:12px;color:#444;margin-bottom:4px;">${listing.title}</div>` : ''}
    ${listing.address ? `<div style="font-size:11px;color:#666;margin-bottom:6px;">📍 ${listing.address}</div>` : ''}
    <div style="display:flex;gap:8px;font-size:11px;color:#555;margin-bottom:8px;">
      ${listing.bedrooms ? `<span>🛏 ${listing.bedrooms}</span>` : ''}
      ${listing.surface_area ? `<span>📐 ${listing.surface_area} m²</span>` : ''}
      ${listing.land_area ? `<span>🌿 ${listing.land_area} m²</span>` : ''}
    </div>
  `;

  const reactionsEl = document.createElement('div');
  root.appendChild(reactionsEl);

  const link = document.createElement('a');
  link.href = listing.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = `View on ${listing.source.charAt(0).toUpperCase()}${listing.source.slice(1)}`;
  link.style.cssText = 'display:block;text-align:center;background:#334155;color:white;padding:6px 10px;border-radius:4px;font-size:12px;font-weight:600;text-decoration:none;margin-top:6px;';
  root.appendChild(link);

  return { root, reactionsEl };
}

// Fills (or refills) a popup's reactions row from the current reactions/
// identity — called once on click and again whenever reactions or the
// viewer's identity change while the popup is open, replacing the
// old per-marker `renderReactions` closure now that there's no persistent
// per-listing DOM node to close over. `users` is for name lookup only (who
// loved/objected), passed by the caller from a ref so this never needs
// `users` in an effect's dependency array just to keep names current.
function renderListingReactions(
  container: HTMLDivElement,
  listingId: string | undefined,
  reactions: ListingReaction[],
  myUserId: string | null,
  onToggleReaction: ((listingId: string, reaction: ReactionKind) => void) | undefined,
  users: CommuteConstraint[],
): void {
  container.innerHTML = '';
  if (!listingId) return; // not yet persisted — nothing to react to

  const rs = reactions.filter(r => r.listing_id === listingId);
  const mine = myUserId ? rs.find(r => r.user_id === myUserId)?.reaction : undefined;
  const nameOf = new globalThis.Map(users.map(u => [u.id, u.name]));
  const loveNames = rs.filter(r => r.reaction === 'love').map(r => nameOf.get(r.user_id) ?? '?');
  const objectNames = rs.filter(r => r.reaction === 'object').map(r => nameOf.get(r.user_id) ?? '?');

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:6px;margin:6px 0;';

  const makeButton = (kind: ReactionKind, label: string, active: boolean, activeBg: string, activeBorder: string) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.setAttribute('data-testid', `reaction-${kind}-button`);
    btn.style.cssText = `flex:1;padding:5px 8px;border-radius:4px;font-size:12px;cursor:pointer;border:1px solid ${active ? activeBorder : '#d4d4d8'};background:${active ? activeBg : 'white'};`;
    if (!myUserId) {
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
    }
    btn.addEventListener('click', () => onToggleReaction?.(listingId, kind));
    return btn;
  };

  row.appendChild(makeButton('love', `❤️ Love${loveNames.length ? ` · ${loveNames.length}` : ''}`, mine === 'love', '#ffe4e6', '#e11d48'));
  row.appendChild(makeButton('object', `✕ Object${objectNames.length ? ` · ${objectNames.length}` : ''}`, mine === 'object', '#e4e4e7', '#52525b'));
  container.appendChild(row);

  const note = document.createElement('div');
  note.style.cssText = 'font-size:10px;color:#888;margin-bottom:4px;';
  if (loveNames.length || objectNames.length) {
    note.textContent = [
      loveNames.length ? `❤️ ${loveNames.join(', ')}` : '',
      objectNames.length ? `✕ ${objectNames.join(', ')}` : '',
    ].filter(Boolean).join('  ·  ');
  } else if (!myUserId) {
    note.textContent = 'Pick your name in the sidebar to vote';
  }
  if (note.textContent) container.appendChild(note);
}

// One end of the price-range filter: free-text input that commits a clamped
// value on blur/Enter and resets to the current value on Escape or bad input.
function PriceInput({ value, lo, hi, align, onCommit }: {
  value: number;
  lo: number;
  hi: number;
  align: 'left' | 'right';
  onCommit: (clamped: number) => void;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      defaultValue={formatPrice(value)}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          e.currentTarget.value = formatPrice(value);
          e.currentTarget.blur();
        }
      }}
      onBlur={(e) => {
        const digits = e.currentTarget.value.replace(/\D/g, '');
        const n = parseInt(digits, 10);
        if (isNaN(n)) {
          e.currentTarget.value = formatPrice(value);
          return;
        }
        onCommit(Math.max(lo, Math.min(n, hi)));
      }}
      className={`font-mono tabular-nums bg-transparent w-24 ${align === 'left' ? 'text-left' : 'text-right'} rounded px-1 py-0.5 hover:bg-muted/60 focus:bg-background focus:ring-1 focus:ring-ring focus:outline-none`}
    />
  );
}

export default function Map({
  users,
  intersection,
  isochrones,
  properties = [],
  isLoading = false,
  reactions = NO_REACTIONS,
  myUserId = null,
  newListingKeys,
  unanimousListingIds,
  onToggleReaction,
  onMapInstance,
}: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(true);
  // 3D buildings + fog cost real GPU work, so they're opt-in via the Layers
  // panel rather than always-on.
  const [show3D, setShow3D] = useState(false);
  // Keyed by participant id so an unrelated re-render (new-but-equal `users`
  // array reference, e.g. from a household-pairing field elsewhere) updates
  // existing markers in place instead of tearing down and recreating every
  // marker DOM node.
  const participantMarkersRef = useRef<Record<string, {
    marker: mapboxgl.Marker;
    el: HTMLDivElement;
    badge: HTMLDivElement;
    popup: mapboxgl.Popup;
  }>>({});
  const onMapInstanceRef = useRef(onMapInstance);
  useEffect(() => { onMapInstanceRef.current = onMapInstance; }, [onMapInstance]);

  // The listing popup's click handler is registered once (in the
  // source/layer-creation effect below) and needs current values every time
  // it fires, so it reads them from refs rather than closing over stale
  // props — the same pattern `onMapInstanceRef` uses above.
  const propertiesRef = useRef(properties);
  useEffect(() => { propertiesRef.current = properties; }, [properties]);
  const reactionsRef = useRef(reactions);
  useEffect(() => { reactionsRef.current = reactions; }, [reactions]);
  const myUserIdRef = useRef(myUserId);
  useEffect(() => { myUserIdRef.current = myUserId; }, [myUserId]);
  const onToggleReactionRef = useRef(onToggleReaction);
  useEffect(() => { onToggleReactionRef.current = onToggleReaction; }, [onToggleReaction]);
  const newListingKeysRef = useRef(newListingKeys);
  useEffect(() => { newListingKeysRef.current = newListingKeys; }, [newListingKeys]);

  // A single, reusable popup instance rather than one per listing: there's no
  // per-listing DOM node left to hang a popup off, so it's created lazily on
  // the first click and moved/refilled on every click after that.
  // `openListingPopup` tracks which listing (if any) it currently shows, and
  // its reactions container, so the reactions-changed effect below knows
  // whether — and what — to refill.
  const listingPopupRef = useRef<mapboxgl.Popup | null>(null);
  const openListingPopupRef = useRef<{ listing: PropertyListing; reactionsEl: HTMLDivElement } | null>(null);

  // Filters applied to property pins
  const [sourceFilter, setSourceFilter] = useState<Record<string, boolean>>({
    immoweb: true,
    zimmo: true,
    realo: true,
    immovlan: true,
    immoscoop: true,
  });
  const [priceRange, setPriceRange] = useState<[number, number] | null>(null);

  // Derive price bounds from the listings that actually have a price
  const priceBounds = useMemo<[number, number] | null>(() => {
    const prices = properties
      .map(p => p.price)
      .filter((p): p is number => typeof p === 'number' && p > 0);
    if (prices.length === 0) return null;
    return [Math.min(...prices), Math.max(...prices)];
  }, [properties]);

  // Reset the price range when the bounds change in a meaningful way.
  // Critically: we depend on a primitive key built from the bound VALUES, not
  // the array reference, so a React re-render that produces a new-but-equal
  // `priceBounds` array (e.g. from toggling an unrelated layer checkbox)
  // doesn't blow away the user's current filter. We also keep the user's
  // range if it still fits the bounds.
  const boundsKey = priceBounds ? `${priceBounds[0]}:${priceBounds[1]}` : '';
  useEffect(() => {
    setPriceRange(prev => {
      if (!priceBounds) return null;
      if (prev && prev[0] >= priceBounds[0] && prev[1] <= priceBounds[1]) return prev;
      return [priceBounds[0], priceBounds[1]];
    });
    // priceBounds is intentionally not in deps — boundsKey captures its value identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey]);

  const hideCommercial = useMemo(
    () => resolveHideCommercial(users, myUserId),
    [users, myUserId]
  );

  const matchesFilters = useCallback(
    (listing: PropertyListing) => passesListingFilters(listing, sourceFilter, priceRange, hideCommercial),
    [sourceFilter, priceRange, hideCommercial]
  );

  const visibleCount = useMemo(
    () => properties.filter(matchesFilters).length,
    [properties, matchesFilters]
  );

  // The listings the map draws, as GeoJSON. Filtering happens here rather
  // than as a Mapbox filter expression so `passesListingFilters` stays the
  // single definition of what's visible — the same predicate behind
  // `visibleCount`, so the panel's count and the map can't disagree.
  const listingData = useMemo<FeatureCollection<Point, ListingFeatureProperties>>(() => {
    const byListing = new globalThis.Map<string, ListingReaction[]>();
    for (const r of reactions) {
      const existing = byListing.get(r.listing_id);
      if (existing) existing.push(r);
      else byListing.set(r.listing_id, [r]);
    }

    const features: Feature<Point, ListingFeatureProperties>[] = [];
    for (const listing of properties) {
      if (!listing.latitude || !listing.longitude) continue;
      if (!matchesFilters(listing)) continue;

      const listingKey = `${listing.source}:${listing.external_id}`;
      const rs = (listing.id && byListing.get(listing.id)) || [];
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [Number(listing.longitude), Number(listing.latitude)],
        },
        properties: {
          listingKey,
          color: SOURCE_COLORS[listing.source] ?? '#6b7280',
          approximate: listing.location_precision === 'approximate',
          objected: rs.some(r => r.reaction === 'object'),
          loved: rs.some(r => r.reaction === 'love'),
          // Unanimity is a household question, not a headcount — the parent
          // computes it from convergence so the map and the dashboard agree.
          lovedByAll: listing.id ? (unanimousListingIds?.has(listing.id) ?? false) : false,
          isNew: newListingKeys?.has(listingKey) ?? false,
        },
      });
    }
    return { type: 'FeatureCollection', features };
  }, [properties, matchesFilters, reactions, newListingKeys, unanimousListingIds]);

  // Individual commute zones default to hidden: with several members their
  // filled overlays stack up and bury the streets. The common area (the only
  // zone that matters for the search) stays visible, and the Zones master
  // toggle brings the per-member zones back when needed.
  const getInitialVisibility = useCallback((): LayerVisibility => ({
    markers: users.map(() => true),
    isochrones: isochrones.map(() => false),
    intersection: true,
    properties: true,
  }), [users, isochrones]);

  const [visibility, setVisibility] = useState<LayerVisibility>(getInitialVisibility);

  // Always-current visibility for the layer-creation effect, which must read
  // it without taking a dependency — adding `visibility` to that effect's deps
  // would tear down and rebuild every isochrone layer on each checkbox toggle.
  const visibilityRef = useRef(visibility);
  visibilityRef.current = visibility;

  // Content-based keys for the isochrone/intersection layer effects below,
  // built the same way as `boundsKey` above: from the VALUES inside each
  // feature's geometry, not the array/object reference. The parent recomputes
  // `isochrones`/`intersection` on every render (even for unrelated state,
  // e.g. renaming a participant), producing new-but-structurally-equal
  // objects — depending on the raw prop would tear down and rebuild the
  // whole ~22-layer isochrone stack, or re-`setData` the intersection source,
  // on every such render. The effects read the current values via these refs
  // instead of taking the objects as dependencies.
  const isochronesKey = isochrones.map(iso => JSON.stringify(iso.geometry.coordinates)).join('|');
  const isochronesRef = useRef(isochrones);
  isochronesRef.current = isochrones;
  const intersectionKey = intersection ? JSON.stringify(intersection.geometry.coordinates) : '';
  const intersectionRef = useRef(intersection);
  intersectionRef.current = intersection;

  // Same content-key idiom for `users`: the intersection effect's no-overlap
  // fallback branch needs participants' current positions to fit the camera,
  // but must not re-run (and, worse, re-`setData` the intersection source in
  // the branch above it) just because the parent produced a new-but-equal
  // `users` reference. Position content, not participant name or anything
  // else, is what the fallback branch actually reads.
  const usersPositionKey = users.map(u => `${u.longitude},${u.latitude}`).join('|');
  const usersRef = useRef(users);
  usersRef.current = users;

  const prevCounts = useRef({ users: users.length, isochrones: isochrones.length });

  useEffect(() => {
    if (users.length !== prevCounts.current.users || isochrones.length !== prevCounts.current.isochrones) {
      prevCounts.current = { users: users.length, isochrones: isochrones.length };
      setVisibility(getInitialVisibility());
    }
  }, [users.length, isochrones.length, getInitialVisibility]);

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN;

  const toggleMarker = useCallback((index: number) => {
    setVisibility(prev => {
      const newMarkers = [...prev.markers];
      newMarkers[index] = !newMarkers[index];
      return { ...prev, markers: newMarkers };
    });
  }, []);

  const toggleIsochrone = useCallback((index: number) => {
    setVisibility(prev => {
      const newIsochrones = [...prev.isochrones];
      newIsochrones[index] = !newIsochrones[index];
      return { ...prev, isochrones: newIsochrones };
    });
  }, []);

  // Master toggle for the per-member zones — hide/show them all in one click,
  // leaving the common-area (intersection) toggle untouched.
  const setAllIsochrones = useCallback((value: boolean) => {
    setVisibility(prev => ({ ...prev, isochrones: prev.isochrones.map(() => value) }));
  }, []);

  const toggleIntersection = useCallback(() => {
    setVisibility(prev => ({ ...prev, intersection: !prev.intersection }));
  }, []);

  const toggleProperties = useCallback(() => {
    setVisibility(prev => ({ ...prev, properties: !prev.properties }));
  }, []);

  // Show all / Hide all toggle the per-layer visibility flags only. They
  // deliberately do NOT touch `sourceFilter` or `priceRange` — filters survive
  // a layer-master toggle, so Show All reveals only the pins that pass the
  // current filter, not the full 462.
  const fadeAllIn = useCallback(() => {
    setVisibility(prev => ({
      ...prev,
      markers: users.map(() => true),
      isochrones: isochrones.map(() => true),
      intersection: true,
      properties: true,
    }));
  }, [users, isochrones]);

  const fadeAllOut = useCallback(() => {
    setVisibility(prev => ({
      ...prev,
      markers: users.map(() => false),
      isochrones: isochrones.map(() => false),
      intersection: false,
      properties: false,
    }));
  }, [users, isochrones]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current || !mapboxToken) return;

    mapboxgl.accessToken = mapboxToken;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/standard',
      config: {
        basemap: {
          lightPreset: 'day',
          showPointOfInterestLabels: true,
        }
      },
      center: [3.7174, 51.0543],
      zoom: 12,
      pitch: 0,
      bearing: 0,
    });

    map.current.on('error', (e) => {
      console.error('Map error:', e.error || e);
    });

    map.current.on('styleimagemissing', (e) => {
      console.warn('Style image missing:', e.id);
    });

    map.current.on('load', () => {
      setMapLoaded(true);
      onMapInstanceRef.current?.(map.current!);
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [mapboxToken]);

  // Add/remove the 3D buildings extrusion + fog when the toggle changes.
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const hasLayer = map.current.getLayer('3d-buildings');

    if (show3D) {
      if (!hasLayer && map.current.getSource('composite')) {
        try {
          map.current.addLayer({
            'id': '3d-buildings',
            'source': 'composite',
            'source-layer': 'building',
            'filter': ['==', 'extrude', 'true'],
            'type': 'fill-extrusion',
            'minzoom': 10,
            'paint': {
              'fill-extrusion-color': '#e0e0e0',
              'fill-extrusion-height': ['get', 'height'],
              'fill-extrusion-base': ['get', 'min_height'],
              'fill-extrusion-opacity': 0.7
            }
          });
        } catch (err) {
          console.warn('3D buildings failed to load:', err);
        }
      }
      try {
        map.current.setFog({
          'range': [-1, 2],
          'horizon-blend': 0.3,
          'color': 'white',
          'high-color': '#87ceeb',
          'space-color': '#cce0ff',
          'star-intensity': 0.0
        });
      } catch (err) {
        console.warn('Fog failed to load:', err);
      }
    } else {
      if (hasLayer) map.current.removeLayer('3d-buildings');
      try {
        map.current.setFog(null);
      } catch (err) {
        console.warn('Fog removal failed:', err);
      }
    }
  }, [show3D, mapLoaded]);

  // Render user markers — incremental, keyed by participant id: a marker's
  // DOM node is only created or removed when a participant is added or
  // removed. For a participant who's still present, position/color/icon/popup
  // are updated on the existing node instead of destroying and recreating it,
  // so an unrelated re-render (e.g. a household-pairing field changing, or
  // simply a fresh-but-equal `users` array) doesn't tear down every marker.
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const wanted = new Set(users.map(u => u.id));

    for (const id of Object.keys(participantMarkersRef.current)) {
      if (!wanted.has(id)) {
        participantMarkersRef.current[id].marker.remove();
        delete participantMarkersRef.current[id];
      }
    }

    users.forEach((user, index) => {
      const color = COLORS[index % COLORS.length];
      const transportIcon = user.transportMode === 'driving' ? '🚗' : '🚲';
      const popupHtml = `<strong>${user.name}</strong><br/>${user.address}<br/>Max: ${user.maxMinutes} min<br/>${transportIcon} ${user.transportMode === 'driving' ? 'Car' : 'Bike'}`;

      const existing = participantMarkersRef.current[user.id];
      if (existing) {
        existing.marker.setLngLat([user.longitude, user.latitude]);
        existing.el.style.backgroundColor = color;
        // textContent clears children, so re-append the same badge node
        // (not a new one) rather than rebuilding it.
        existing.el.textContent = (index + 1).toString();
        existing.el.appendChild(existing.badge);
        existing.badge.textContent = transportIcon;
        existing.popup.setHTML(popupHtml);
        return;
      }

      const el = document.createElement('div');
      el.className = 'user-marker';
      el.id = `marker-${index}`;
      el.style.width = '24px';
      el.style.height = '24px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = color;
      el.style.border = '3px solid white';
      el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.color = 'white';
      el.style.fontWeight = 'bold';
      el.style.fontSize = '12px';
      el.style.cursor = 'pointer';
      el.style.transition = 'opacity 300ms ease';
      el.textContent = (index + 1).toString();

      const badge = document.createElement('div');
      badge.style.position = 'absolute';
      badge.style.bottom = '-4px';
      badge.style.right = '-4px';
      badge.style.width = '16px';
      badge.style.height = '16px';
      badge.style.borderRadius = '50%';
      badge.style.backgroundColor = 'white';
      badge.style.display = 'flex';
      badge.style.alignItems = 'center';
      badge.style.justifyContent = 'center';
      badge.style.fontSize = '10px';
      badge.style.boxShadow = '0 1px 2px rgba(0,0,0,0.2)';
      badge.textContent = transportIcon;
      el.appendChild(badge);

      if (map.current) {
        const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(popupHtml);
        const marker = new mapboxgl.Marker(el)
          .setLngLat([user.longitude, user.latitude])
          .setPopup(popup)
          .addTo(map.current);
        participantMarkersRef.current[user.id] = { marker, el, badge, popup };
      }
    });
  }, [users, mapLoaded]);

  // Toggle user marker visibility
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    users.forEach((user, index) => {
      const el = participantMarkersRef.current[user.id]?.el;
      if (el) el.style.opacity = visibility.markers[index] ? '1' : '0';
    });
  }, [visibility.markers, users, mapLoaded]);

  // Render listing pins as one clustered GeoJSON source rather than a marker
  // per listing. Source and layers are created once; everything after that —
  // filters, reactions, freshness — arrives as new data on the same source.
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const m = map.current;
    if (m.getSource(LISTINGS_SOURCE)) return;

    m.addSource(LISTINGS_SOURCE, {
      type: 'geojson',
      data: EMPTY_LISTINGS,
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 50,
    });

    // Layers are created in a different commit than the panel's toggle state
    // flips, so apply the current visibility at creation — same reason the
    // isochrone layers read `visibilityRef` below.
    const listingsVisibility: 'visible' | 'none' = visibilityRef.current.properties ? 'visible' : 'none';

    // Glow behind a listing every household is yes on, halo behind one that's
    // new since the last visit. A circle layer can't carry the two stacked
    // box-shadows the old DOM dot did, so they get their own layer beneath.
    m.addLayer({
      id: LISTINGS_HALO_LAYER,
      type: 'circle',
      source: LISTINGS_SOURCE,
      layout: { visibility: listingsVisibility },
      filter: ['any', ['==', ['get', 'lovedByAll'], true], ['==', ['get', 'isNew'], true]],
      paint: {
        'circle-radius': ['case', ['get', 'lovedByAll'], 13, 11],
        'circle-color': ['case', ['get', 'lovedByAll'], '#f59e0b', '#2563eb'],
        'circle-opacity': ['case', ['get', 'lovedByAll'], 0.45, 0.35],
      },
    });

    m.addLayer({
      id: LISTINGS_POINT_LAYER,
      type: 'circle',
      source: LISTINGS_SOURCE,
      layout: { visibility: listingsVisibility },
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': 7,
        // Postcode-centroid pins stay hollow, so an approximate location is
        // never mistaken for a real one.
        'circle-color': ['case', ['get', 'approximate'], 'rgba(0,0,0,0)', ['get', 'color']],
        // An objection dims a listing, it never removes it — ADR 0002.
        'circle-opacity': ['case', ['get', 'objected'], 0.35, 1],
        'circle-stroke-width': 2,
        'circle-stroke-color': [
          'case',
          ['get', 'loved'], '#f59e0b',
          ['get', 'approximate'], ['get', 'color'],
          '#ffffff',
        ],
        'circle-stroke-opacity': ['case', ['get', 'objected'], 0.35, 1],
      },
    });

    m.addLayer({
      id: LISTINGS_CLUSTER_LAYER,
      type: 'circle',
      source: LISTINGS_SOURCE,
      layout: { visibility: listingsVisibility },
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#334155',
        'circle-opacity': 0.85,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
        'circle-radius': ['step', ['get', 'point_count'], 14, 25, 20, 100, 26],
      },
    });

    m.addLayer({
      id: LISTINGS_CLUSTER_COUNT_LAYER,
      type: 'symbol',
      source: LISTINGS_SOURCE,
      layout: {
        visibility: listingsVisibility,
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': 12,
      },
      paint: { 'text-color': '#ffffff' },
    });

    // A cluster is only useful if it opens: clicking one zooms to where it
    // breaks apart.
    m.on('click', LISTINGS_CLUSTER_LAYER, (e) => {
      const feature = e.features?.[0];
      const clusterId = feature?.properties?.cluster_id;
      const geometry = feature?.geometry;
      if (typeof clusterId !== 'number' || geometry?.type !== 'Point') return;
      const source = m.getSource(LISTINGS_SOURCE) as mapboxgl.GeoJSONSource | undefined;
      source?.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err || zoom == null) return;
        m.easeTo({ center: geometry.coordinates as [number, number], zoom });
      });
    });

    // Clicking an individual listing opens (or moves) the single reusable
    // popup. The clicked feature carries `listingKey` (`source:external_id`),
    // resolved back to a PropertyListing via propertiesRef — reading refs
    // rather than closing over `properties`/`reactions`/etc. because this
    // handler is registered once, when the layer is created, not on every
    // render.
    m.on('click', LISTINGS_POINT_LAYER, (e) => {
      const feature = e.features?.[0];
      const listingKey = feature?.properties?.listingKey as string | undefined;
      const geometry = feature?.geometry;
      if (!listingKey || geometry?.type !== 'Point') return;
      const listing = propertiesRef.current.find(
        (p) => `${p.source}:${p.external_id}` === listingKey
      );
      if (!listing) return;

      const isNew = newListingKeysRef.current?.has(listingKey) ?? false;
      const { root, reactionsEl } = buildListingPopupContent(listing, isNew);
      openListingPopupRef.current = { listing, reactionsEl };
      renderListingReactions(
        reactionsEl,
        listing.id,
        reactionsRef.current,
        myUserIdRef.current,
        onToggleReactionRef.current,
        usersRef.current
      );

      if (!listingPopupRef.current) {
        listingPopupRef.current = new mapboxgl.Popup({ offset: 14, maxWidth: '240px' });
        listingPopupRef.current.on('close', () => { openListingPopupRef.current = null; });
      }
      listingPopupRef.current
        .setLngLat(geometry.coordinates as [number, number])
        .setDOMContent(root)
        .addTo(m);
    });

    // Cursor affordance on both.
    for (const layerId of [LISTINGS_CLUSTER_LAYER, LISTINGS_POINT_LAYER]) {
      m.on('mouseenter', layerId, () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', layerId, () => { m.getCanvas().style.cursor = ''; });
    }
  }, [mapLoaded]);

  // Keep an open popup's reactions row current: someone else reacting, or the
  // viewer picking their name, should be reflected without needing to
  // reopen the popup. Mirrors the old per-marker `renderReactions` effect,
  // but against the single open popup rather than every marker.
  useEffect(() => {
    const open = openListingPopupRef.current;
    if (!open) return;
    renderListingReactions(open.reactionsEl, open.listing.id, reactions, myUserId, onToggleReaction, usersRef.current);
  }, [reactions, myUserId, onToggleReaction]);

  // Feed the listing source. Filter changes, reactions, unanimity and
  // freshness all land here as new data on the existing source — the source
  // is never torn down and rebuilt for them.
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const source = map.current.getSource(LISTINGS_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    source?.setData(listingData);
  }, [listingData, mapLoaded]);

  // Master toggle for the listing layers.
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const value = visibility.properties ? 'visible' : 'none';
    for (const layerId of LISTINGS_LAYERS) {
      if (map.current.getLayer(layerId)) {
        map.current.setLayoutProperty(layerId, 'visibility', value);
      }
    }
  }, [visibility.properties, mapLoaded]);

  // Mapbox only tracks window resizes; when the container itself changes size
  // (sidebar content growing, layout settling) the canvas keeps its old
  // dimensions and tiles stop partway. Observe the container directly.
  useEffect(() => {
    if (!mapLoaded || !map.current || !mapContainer.current) return;
    const observer = new ResizeObserver(() => { map.current?.resize(); });
    observer.observe(mapContainer.current);
    return () => observer.disconnect();
  }, [mapLoaded]);

  // Isochrone visibility — toggles per-zone outline layers AND filters the
  // combined fade/outline-dash layer so only the checked zones contribute.
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    isochrones.forEach((_, index) => {
      const sourceId = `isochrone-${index}`;
      if (map.current?.getLayer(`${sourceId}-fill`)) {
        map.current.setLayoutProperty(`${sourceId}-fill`, 'visibility', visibility.isochrones[index] ? 'visible' : 'none');
      }
      if (map.current?.getLayer(`${sourceId}-outline`)) {
        map.current.setLayoutProperty(`${sourceId}-outline`, 'visibility', visibility.isochrones[index] ? 'visible' : 'none');
      }
    });

    // Hide individual zones from the combined layer by index via a Mapbox
    // expression filter. Without this, the combined layer ignores per-zone
    // checkboxes and renders every zone whenever ANY zone is enabled.
    const visibleIdxs = visibility.isochrones
      .map((v, i) => (v ? i : -1))
      .filter(i => i !== -1);
    const filterExpr = ['in', ['get', 'idx'], ['literal', visibleIdxs]] as mapboxgl.FilterSpecification;
    const anyVisible = visibleIdxs.length > 0;

    if (map.current.getLayer('isochrones-fade')) {
      map.current.setFilter('isochrones-fade', filterExpr);
      map.current.setLayoutProperty('isochrones-fade', 'visibility', anyVisible ? 'visible' : 'none');
    }
    if (map.current.getLayer('isochrones-outline-dash')) {
      map.current.setFilter('isochrones-outline-dash', filterExpr);
      map.current.setLayoutProperty('isochrones-outline-dash', 'visibility', anyVisible ? 'visible' : 'none');
    }
  }, [visibility.isochrones, mapLoaded, isochrones]);

  // Intersection visibility
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    ['intersection-fill', 'intersection-fade', 'intersection-outline', 'intersection-outline-dash'].forEach(layerId => {
      if (map.current?.getLayer(layerId)) {
        map.current.setLayoutProperty(layerId, 'visibility', visibility.intersection ? 'visible' : 'none');
      }
    });
  }, [visibility.intersection, mapLoaded]);

  // Render isochrone layers — rebuilt only when the participant set changes.
  // Intersection is handled separately below so a search-buffer change (new
  // intersection geometry, same participants) updates in place instead of
  // tearing these layers down and re-fitting the camera on every slider tick.
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const isochrones = isochronesRef.current;

    const isochroneSources = Array.from({ length: 10 }, (_, i) => `isochrone-${i}`);
    isochroneSources.forEach(sourceId => {
      if (map.current?.getLayer(`${sourceId}-fill`)) map.current.removeLayer(`${sourceId}-fill`);
      if (map.current?.getLayer(`${sourceId}-outline`)) map.current.removeLayer(`${sourceId}-outline`);
      if (map.current?.getSource(sourceId)) map.current.removeSource(sourceId);
    });

    ['isochrones-fade', 'isochrones-outline-dash'].forEach(id => {
      if (map.current?.getLayer(id)) map.current.removeLayer(id);
    });
    if (map.current.getSource('isochrones-combined')) map.current.removeSource('isochrones-combined');

    isochrones.forEach((isochrone, index) => {
      const color = COLORS[index % COLORS.length];
      const sourceId = `isochrone-${index}`;

      map.current?.addSource(sourceId, { type: 'geojson', data: isochrone });
      // Apply the panel's current per-zone visibility at creation: layers are
      // created in a different commit than the toggle state flips, so a layer
      // left at Mapbox's default 'visible' would show a zone its checkbox
      // says is hidden until the user toggles it.
      const zoneVisible = visibilityRef.current.isochrones[index] ? 'visible' : 'none';
      map.current?.addLayer({ id: `${sourceId}-fill`, type: 'fill', source: sourceId, layout: { visibility: zoneVisible }, paint: { 'fill-color': color, 'fill-opacity': 0 } });
      map.current?.addLayer({ id: `${sourceId}-outline`, type: 'line', source: sourceId, layout: { visibility: zoneVisible }, paint: { 'line-color': color, 'line-width': 2 } });
    });

    // Tag every feature with its zone index so we can selectively hide
    // individual zones from the combined fade/outline layer below.
    const allIsochroneFeatures = isochrones.map((iso, idx) => ({
      ...iso,
      properties: { ...iso.properties, color: COLORS[idx % COLORS.length], idx }
    }));

    if (allIsochroneFeatures.length > 0) {
      // Same creation-time visibility as the per-zone layers above: the
      // combined layer must respect the panel state even if no toggle has been
      // flipped since the layers were created.
      const visibleIdxs = visibilityRef.current.isochrones
        .map((v, i) => (v ? i : -1))
        .filter(i => i !== -1);
      const anyVisible = visibleIdxs.length > 0;
      const combinedFilter = ['in', ['get', 'idx'], ['literal', visibleIdxs]] as mapboxgl.FilterSpecification;

      map.current?.addSource('isochrones-combined', { type: 'geojson', data: { type: 'FeatureCollection', features: allIsochroneFeatures } });
      map.current?.addLayer({ id: 'isochrones-fade', type: 'fill', source: 'isochrones-combined', layout: { visibility: anyVisible ? 'visible' : 'none' }, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.4, 'fill-opacity-transition': { duration: 300 } } });
      map.current?.addLayer({ id: 'isochrones-outline-dash', type: 'line', source: 'isochrones-combined', layout: { visibility: anyVisible ? 'visible' : 'none' }, paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-dasharray': [2, 1] } });
      map.current?.setFilter('isochrones-fade', combinedFilter);
      map.current?.setFilter('isochrones-outline-dash', combinedFilter);
    }
  }, [isochronesKey, mapLoaded]);

  // Intersection layers — create once (fitting the camera), then update the
  // source data in place so the green zone morphs smoothly when the search
  // buffer changes instead of blinking out and re-fitting.
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const intersection = intersectionRef.current;
    const hasSource = !!map.current.getSource('intersection');

    if (intersection) {
      if (hasSource) {
        (map.current.getSource('intersection') as mapboxgl.GeoJSONSource)
          .setData(intersection);
        return;
      }

      const intersectionVisible = visibilityRef.current.intersection ? 'visible' : 'none';
      map.current.addSource('intersection', { type: 'geojson', data: intersection });
      map.current.addLayer({ id: 'intersection-fill', type: 'fill', source: 'intersection', layout: { visibility: intersectionVisible }, paint: { 'fill-color': '#22c55e', 'fill-opacity': 0 } });
      map.current.addLayer({ id: 'intersection-fade', type: 'fill', source: 'intersection', layout: { visibility: intersectionVisible }, paint: { 'fill-color': '#22c55e', 'fill-opacity': 0.5, 'fill-opacity-transition': { duration: 300 } } });
      map.current.addLayer({ id: 'intersection-outline', type: 'line', source: 'intersection', layout: { visibility: intersectionVisible }, paint: { 'line-color': '#16a34a', 'line-width': 3 } });
      map.current.addLayer({ id: 'intersection-outline-dash', type: 'line', source: 'intersection', layout: { visibility: intersectionVisible }, paint: { 'line-color': '#16a34a', 'line-width': 2, 'line-dasharray': [2, 1], 'line-opacity': 0.6 } });

      const bounds = new mapboxgl.LngLatBounds();
      const coords = intersection.geometry.coordinates;
      if (intersection.geometry.type === 'Polygon') {
        (coords as number[][][])[0].forEach((coord) => bounds.extend([coord[0], coord[1]]));
      } else {
        (coords as number[][][][]).forEach((polygon) => polygon[0].forEach((coord) => bounds.extend([coord[0], coord[1]])));
      }
      if (!bounds.isEmpty()) map.current.fitBounds(bounds, { padding: 50 });
      return;
    }

    // No intersection: tear down the layers. If there are still participants
    // (their zones simply don't overlap), frame them instead.
    ['intersection-fill', 'intersection-outline', 'intersection-fade', 'intersection-outline-dash'].forEach(id => {
      if (map.current?.getLayer(id)) map.current.removeLayer(id);
    });
    if (map.current.getSource('intersection')) map.current.removeSource('intersection');

    const currentUsers = usersRef.current;
    if (currentUsers.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      currentUsers.forEach((user) => bounds.extend([user.longitude, user.latitude]));
      map.current.fitBounds(bounds, { padding: 100 });
    }
  }, [intersectionKey, usersPositionKey, mapLoaded]);

  if (!mapboxToken) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 text-destructive p-4 text-sm">
        Error: Mapbox public token not configured. Please set NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN in your environment.
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[500px] overflow-hidden">
      <div ref={mapContainer} className="w-full h-full" />

      <Button
        onClick={() => setPanelExpanded(!panelExpanded)}
        variant="outline"
        size="icon"
        className="absolute top-3 left-3 z-20 bg-background/95 backdrop-blur shadow-md"
        title={panelExpanded ? 'Collapse layers' : 'Show layers'}
      >
        {panelExpanded ? <Eye className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
      </Button>

      {panelExpanded && (
        <div className="absolute top-3 left-16 z-10 w-64 max-h-[calc(100%-1.5rem)] overflow-y-auto space-y-2">
          <div className="rounded-lg border border-border bg-background/95 backdrop-blur shadow-md p-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold tracking-tight">Layers</h2>
            </div>

            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Display
              </div>
              <label className="flex items-center gap-2 py-1 cursor-pointer text-sm">
                <Checkbox checked={show3D} onCheckedChange={(v) => setShow3D(v === true)} />
                <span>3D buildings</span>
              </label>
            </div>

            {users.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  Markers · {users.length}
                </div>
                {users.map((user, index) => (
                  <label
                    key={`marker-${index}`}
                    className="flex items-center gap-2 py-1 cursor-pointer text-sm"
                  >
                    <Checkbox
                      checked={visibility.markers[index] ?? true}
                      onCheckedChange={() => toggleMarker(index)}
                    />
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="truncate">{user.name}</span>
                  </label>
                ))}
              </div>
            )}

            {isochrones.length > 0 && (
              <>
                <Separator className="my-3" />
                <div className="space-y-1.5">
                  <label className="flex items-center justify-between gap-2 cursor-pointer">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                      Zones · {isochrones.length}
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      {visibility.isochrones.every(Boolean) ? 'Hide all' : 'Show all'}
                      <Checkbox
                        checked={visibility.isochrones.every(Boolean)}
                        onCheckedChange={() => setAllIsochrones(!visibility.isochrones.every(Boolean))}
                      />
                    </span>
                  </label>
                  {isochrones.map((_, index) => (
                    <label
                      key={`isochrone-${index}`}
                      className="flex items-center gap-2 py-1 cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={visibility.isochrones[index] ?? true}
                        onCheckedChange={() => toggleIsochrone(index)}
                      />
                      <span
                        className="h-3 w-3 rounded-sm shrink-0"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span>Zone {index + 1}</span>
                    </label>
                  ))}
                </div>
              </>
            )}

            {intersection && (
              <>
                <Separator className="my-3" />
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                    Intersection
                  </div>
                  <label className="flex items-center gap-2 py-1 cursor-pointer text-sm">
                    <Checkbox
                      checked={visibility.intersection}
                      onCheckedChange={toggleIntersection}
                    />
                    <span className="h-3 w-3 rounded-sm shrink-0 bg-green-500" />
                    <span>Common area</span>
                  </label>
                </div>
              </>
            )}

            {properties.length > 0 && (
              <>
                <Separator className="my-3" />
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                      Properties
                    </div>
                    <div className="text-[10px] font-mono tabular-nums text-muted-foreground">
                      {visibleCount}/{properties.length}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 py-1 cursor-pointer text-sm">
                    <Checkbox
                      checked={visibility.properties}
                      onCheckedChange={toggleProperties}
                    />
                    <span>🏠</span>
                    <span>For sale</span>
                  </label>

                  {/* Per-source filter — only render rows for sources actually present */}
                  <div className="space-y-1 pl-6">
                    {(['immoweb', 'zimmo', 'realo', 'immovlan', 'immoscoop'] as const)
                      .filter(s => properties.some(p => p.source === s))
                      .map(s => (
                        <label key={s} className="flex items-center gap-2 cursor-pointer text-xs">
                          <Checkbox
                            checked={sourceFilter[s] !== false}
                            onCheckedChange={(v) =>
                              setSourceFilter(prev => ({ ...prev, [s]: v === true }))
                            }
                          />
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: SOURCE_COLORS[s] }}
                          />
                          <span className="capitalize">{s}</span>
                        </label>
                      ))}
                  </div>

                  {/* Price range — only show if there's a real spread to filter on */}
                  {priceBounds && priceRange && priceBounds[1] > priceBounds[0] && (
                    <div className="space-y-2 pt-2 border-t border-border/50">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                        Price range
                      </div>
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <PriceInput
                          key={`min-${priceRange[0]}`}
                          value={priceRange[0]}
                          lo={priceBounds[0]}
                          hi={priceRange[1]}
                          align="left"
                          onCommit={(clamped) => setPriceRange([clamped, priceRange[1]])}
                        />
                        <PriceInput
                          key={`max-${priceRange[1]}`}
                          value={priceRange[1]}
                          lo={priceRange[0]}
                          hi={priceBounds[1]}
                          align="right"
                          onCommit={(clamped) => setPriceRange([priceRange[0], clamped])}
                        />
                      </div>
                      <Slider
                        min={priceBounds[0]}
                        max={priceBounds[1]}
                        step={Math.max(1000, Math.round((priceBounds[1] - priceBounds[0]) / 200))}
                        value={priceRange}
                        onValueChange={(v) => {
                          if (Array.isArray(v) && v.length >= 2) {
                            setPriceRange([v[0], v[1]]);
                          }
                        }}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="rounded-lg border border-border bg-background/95 backdrop-blur shadow-md p-3">
            <div className="flex gap-2">
              <Button onClick={fadeAllIn} size="sm" variant="outline" className="flex-1 h-8 text-xs">
                Show all
              </Button>
              <Button onClick={fadeAllOut} size="sm" variant="outline" className="flex-1 h-8 text-xs">
                Hide all
              </Button>
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="absolute inset-0 bg-background/40 backdrop-blur-[2px] flex items-center justify-center z-30">
          <div className="rounded-lg border border-border bg-background shadow-lg px-4 py-3 flex items-center gap-3 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span>Loading…</span>
          </div>
        </div>
      )}
    </div>
  );
}
