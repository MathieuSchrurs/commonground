'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import { Feature, Polygon, MultiPolygon } from 'geojson';
import { Eye, Layers, Loader2 } from 'lucide-react';
import { CommuteConstraint } from '@/types/user';
import { PropertyListing } from '@/scraper/types';
import { ListingReaction, ReactionKind } from '@/types/reactions';
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
  onToggleReaction?: (listingId: string, reaction: ReactionKind) => void;
  /** `source:external_id` keys of listings that appeared since the last visit */
  newListingKeys?: Set<string>;
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

function formatPrice(price?: number): string {
  if (!price) return 'Price on request';
  return `€${price.toLocaleString('nl-BE')}`;
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
  reactions = [],
  myUserId = null,
  onToggleReaction,
  newListingKeys,
}: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(true);
  // 3D buildings + fog cost real GPU work, so they're opt-in via the Layers
  // panel rather than always-on.
  const [show3D, setShow3D] = useState(false);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const markerContainersRef = useRef<HTMLDivElement[]>([]);
  // Keyed by source:external_id so we can update visibility without recreating
  // DOM nodes on filter changes. Using a plain object — the component is
  // already named `Map`, which shadows the global Map constructor inside the
  // function body.
  const propertyMarkersRef = useRef<Record<string, {
    marker: mapboxgl.Marker;
    listing: PropertyListing;
    renderReactions?: () => void;
  }>>({});

  // Popup vote buttons are plain DOM created once per marker; these refs let
  // their click handlers and re-renders always see the latest props without
  // recreating markers on every reaction change.
  const reactionsRef = useRef(reactions);
  useEffect(() => { reactionsRef.current = reactions; }, [reactions]);
  const myUserIdRef = useRef(myUserId);
  useEffect(() => { myUserIdRef.current = myUserId; }, [myUserId]);
  const onToggleReactionRef = useRef(onToggleReaction);
  useEffect(() => { onToggleReactionRef.current = onToggleReaction; }, [onToggleReaction]);
  const usersForNamesRef = useRef(users);
  useEffect(() => { usersForNamesRef.current = users; }, [users]);

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

  const matchesFilters = useCallback((listing: PropertyListing) => {
    if (sourceFilter[listing.source] === false) return false;
    if (listing.price != null && priceRange) {
      if (listing.price < priceRange[0] || listing.price > priceRange[1]) return false;
    }
    return true;
  }, [sourceFilter, priceRange]);

  const visibleCount = useMemo(
    () => properties.filter(matchesFilters).length,
    [properties, matchesFilters]
  );

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

  // Always-current filter state so the marker-creation effect can apply the
  // right opacity on new pins without listing filters in its deps (which
  // would tear down DOM on every slider drag).
  const filterStateRef = useRef({ sourceFilter, priceRange, visibilityProperties: visibility.properties });
  filterStateRef.current = { sourceFilter, priceRange, visibilityProperties: visibility.properties };

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

  // Render user markers
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];
    markerContainersRef.current = [];

    users.forEach((user, index) => {
      const color = COLORS[index % COLORS.length];
      const transportIcon = user.transportMode === 'driving' ? '🚗' : '🚲';

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
        const marker = new mapboxgl.Marker(el)
          .setLngLat([user.longitude, user.latitude])
          .setPopup(
            new mapboxgl.Popup({ offset: 25 }).setHTML(
              `<strong>${user.name}</strong><br/>${user.address}<br/>Max: ${user.maxMinutes} min<br/>${transportIcon} ${user.transportMode === 'driving' ? 'Car' : 'Bike'}`
            )
          )
          .addTo(map.current);
        markersRef.current.push(marker);
        markerContainersRef.current.push(el);
      }
    });
  }, [users, mapLoaded]);

  // Toggle user marker visibility
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    markerContainersRef.current.forEach((el, index) => {
      if (el) el.style.opacity = visibility.markers[index] ? '1' : '0';
    });
  }, [visibility.markers, mapLoaded]);

  // Render property markers — incremental: only create new markers and remove
  // ones no longer in the list. Filter visibility is handled separately.
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const wanted = new Set<string>();
    properties.forEach(l => wanted.add(`${l.source}:${l.external_id}`));

    // Drop markers no longer present
    for (const key of Object.keys(propertyMarkersRef.current)) {
      if (!wanted.has(key)) {
        propertyMarkersRef.current[key].marker.remove();
        delete propertyMarkersRef.current[key];
      }
    }

    properties.forEach((listing) => {
      const key = `${listing.source}:${listing.external_id}`;
      if (propertyMarkersRef.current[key]) return; // already on map
      if (!listing.latitude || !listing.longitude) return;

      const color = SOURCE_COLORS[listing.source] ?? '#6b7280';

      // Mapbox positions the outer `el` via inline `transform: translate(...)`.
      // Don't touch its transform — animate a child instead. The dot stays
      // symmetric so anchor: 'center' lands the coordinate at the visual middle.
      const el = document.createElement('div');
      el.style.width = '14px';
      el.style.height = '14px';
      el.style.cursor = 'pointer';

      const approximate = listing.location_precision === 'approximate';

      const dot = document.createElement('div');
      dot.style.width = '14px';
      dot.style.height = '14px';
      dot.style.borderRadius = '50%';
      // Postcode-centroid pins: hollow ring instead of solid dot, so an
      // approximate location is never mistaken for a real one.
      dot.style.backgroundColor = approximate ? 'transparent' : color;
      dot.style.border = approximate ? `2px dashed ${color}` : '2px solid white';
      dot.style.boxShadow = '0 1px 3px rgba(0,0,0,0.4)';
      dot.style.transition = 'transform 150ms ease, opacity 300ms ease';
      dot.style.transformOrigin = 'center';
      el.appendChild(dot);

      el.addEventListener('mouseenter', () => { dot.style.transform = 'scale(1.5)'; });
      el.addEventListener('mouseleave', () => { dot.style.transform = 'scale(1)'; });

      const isNew = newListingKeys?.has(key) ?? false;

      const dropped = listing.previous_price != null && listing.price != null
        && listing.previous_price !== listing.price;
      const priceChangeHtml = dropped
        ? `<span style="color:${listing.price! < listing.previous_price! ? '#16a34a' : '#dc2626'};font-size:11px;font-weight:600;margin-left:6px;">${listing.price! < listing.previous_price! ? '↓' : '↑'} was ${formatPrice(listing.previous_price!)}</span>`
        : '';
      const daysOnMarket = listing.first_seen_at
        ? Math.max(0, Math.floor((Date.now() - Date.parse(listing.first_seen_at)) / 86400000))
        : null;

      // Popup is real DOM (not an HTML string) so the vote buttons can carry
      // working click handlers.
      const popupEl = document.createElement('div');
      popupEl.style.cssText = 'max-width:220px;font-family:sans-serif;';
      popupEl.innerHTML = `
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

      // Love/object controls, re-rendered whenever reactions or identity change
      const reactionsEl = document.createElement('div');
      popupEl.appendChild(reactionsEl);
      const renderReactions = () => {
        reactionsEl.innerHTML = '';
        if (!listing.id) return; // not yet persisted — nothing to react to

        const rs = reactionsRef.current.filter(r => r.listing_id === listing.id);
        const me = myUserIdRef.current;
        const mine = me ? rs.find(r => r.user_id === me)?.reaction : undefined;
        const nameOf = new globalThis.Map(usersForNamesRef.current.map(u => [u.id, u.name]));
        const loveNames = rs.filter(r => r.reaction === 'love').map(r => nameOf.get(r.user_id) ?? '?');
        const objectNames = rs.filter(r => r.reaction === 'object').map(r => nameOf.get(r.user_id) ?? '?');

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;';
        const makeButton = (kind: ReactionKind, label: string, active: boolean, activeBg: string, activeBorder: string) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = label;
          btn.style.cssText = `flex:1;padding:5px 8px;border-radius:4px;font-size:12px;cursor:pointer;border:1px solid ${active ? activeBorder : '#d4d4d8'};background:${active ? activeBg : 'white'};`;
          if (!me) {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
          }
          btn.addEventListener('click', () => onToggleReactionRef.current?.(listing.id!, kind));
          return btn;
        };
        row.appendChild(makeButton('love', `❤️ Love${loveNames.length ? ` · ${loveNames.length}` : ''}`, mine === 'love', '#ffe4e6', '#e11d48'));
        row.appendChild(makeButton('object', `✕ Object${objectNames.length ? ` · ${objectNames.length}` : ''}`, mine === 'object', '#e4e4e7', '#52525b'));
        reactionsEl.appendChild(row);

        const note = document.createElement('div');
        note.style.cssText = 'font-size:10px;color:#888;margin-bottom:8px;';
        if (loveNames.length || objectNames.length) {
          note.textContent = [
            loveNames.length ? `❤️ ${loveNames.join(', ')}` : '',
            objectNames.length ? `✕ ${objectNames.join(', ')}` : '',
          ].filter(Boolean).join('  ·  ');
        } else if (!me) {
          note.textContent = 'Pick your name in the sidebar to vote';
        }
        if (note.textContent) reactionsEl.appendChild(note);
      };

      popupEl.insertAdjacentHTML('beforeend', `
        <a href="${listing.url}" target="_blank" rel="noopener noreferrer"
           style="display:block;text-align:center;background:${color};color:white;padding:6px 10px;border-radius:4px;font-size:12px;font-weight:600;text-decoration:none;">
          View on ${listing.source.charAt(0).toUpperCase() + listing.source.slice(1)}
        </a>
      `);

      if (map.current) {
        const popup = new mapboxgl.Popup({ offset: 14, maxWidth: '240px' }).setDOMContent(popupEl);
        popup.on('open', renderReactions);
        const marker = new mapboxgl.Marker(el)
          .setLngLat([Number(listing.longitude), Number(listing.latitude)])
          .setPopup(popup)
          .addTo(map.current);
        propertyMarkersRef.current[key] = { marker, listing, renderReactions };

        // Apply current filter at creation. We set opacity on the child `dot`
        // (not `el`) because Mapbox rewrites the outer marker's inline opacity
        // on zoom/move for its own terrain-occlusion fade — that would wipe
        // out our filter. `pointer-events` goes on the outer so hidden pins
        // can't be clicked through.
        const { sourceFilter: sf, priceRange: pr, visibilityProperties: vp } = filterStateRef.current;
        const sOk = sf[listing.source] !== false;
        const pOk = listing.price == null || !pr
          || (listing.price >= pr[0] && listing.price <= pr[1]);
        const initiallyVisible = vp && sOk && pOk;
        dot.style.opacity = initiallyVisible ? '1' : '0';
        el.style.pointerEvents = initiallyVisible ? 'auto' : 'none';
      }
    });
  }, [properties, mapLoaded, newListingKeys]);

  // Mapbox only tracks window resizes; when the container itself changes size
  // (sidebar content growing, layout settling) the canvas keeps its old
  // dimensions and tiles stop partway. Observe the container directly.
  useEffect(() => {
    if (!mapLoaded || !map.current || !mapContainer.current) return;
    const observer = new ResizeObserver(() => { map.current?.resize(); });
    observer.observe(mapContainer.current);
    return () => observer.disconnect();
  }, [mapLoaded]);

  // Re-render vote buttons inside any open popup when reactions or the
  // viewer's identity change (e.g. someone else votes while you're looking).
  useEffect(() => {
    for (const { marker, renderReactions } of Object.values(propertyMarkersRef.current)) {
      if (renderReactions && marker.getPopup()?.isOpen()) renderReactions();
    }
  }, [reactions, myUserId, users, mapLoaded]);

  // Pin styling from group opinion + freshness:
  //  - objected to by anyone → desaturated
  //  - loved by someone  → amber ring
  //  - loved by everyone → amber ring + glow
  //  - new since last visit → blue halo
  useEffect(() => {
    for (const key of Object.keys(propertyMarkersRef.current)) {
      const { marker, listing } = propertyMarkersRef.current[key];
      const dot = marker.getElement()?.firstElementChild as HTMLElement | null;
      if (!dot) continue;

      const rs = listing.id ? reactions.filter(r => r.listing_id === listing.id) : [];
      const objected = rs.some(r => r.reaction === 'object');
      const loves = new Set(rs.filter(r => r.reaction === 'love').map(r => r.user_id));
      const lovedByAll = users.length > 1 && users.every(u => loves.has(u.id));
      const isNew = newListingKeys?.has(key) ?? false;

      const approx = listing.location_precision === 'approximate';
      const baseBorderColor = approx ? (SOURCE_COLORS[listing.source] ?? '#6b7280') : 'white';
      dot.style.filter = objected ? 'grayscale(0.85)' : '';
      dot.style.border = loves.size > 0
        ? `2px ${approx ? 'dashed' : 'solid'} #f59e0b`
        : `2px ${approx ? 'dashed' : 'solid'} ${baseBorderColor}`;

      const shadows = ['0 1px 3px rgba(0,0,0,0.4)'];
      if (lovedByAll) shadows.push('0 0 0 4px rgba(245,158,11,0.45)');
      if (isNew) shadows.push(`0 0 0 ${lovedByAll ? 8 : 4}px rgba(37,99,235,0.35)`);
      dot.style.boxShadow = shadows.join(', ');
    }
  }, [reactions, users, newListingKeys, mapLoaded, properties]);

  // Apply master toggle + filter visibility — runs after creation, and again
  // whenever any filter changes. Reads always-current state via the ref Map.
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    for (const key of Object.keys(propertyMarkersRef.current)) {
      const { marker, listing } = propertyMarkersRef.current[key];
      const el = marker.getElement();
      if (!el) continue;
      // Apply opacity to the inner dot — Mapbox manages the outer element's
      // opacity for its own terrain-occlusion fade and would override us on
      // every zoom/pan.
      const dot = el.firstElementChild as HTMLElement | null;
      const sourceOk = sourceFilter[listing.source] !== false;
      const priceOk = listing.price == null || !priceRange
        || (listing.price >= priceRange[0] && listing.price <= priceRange[1]);
      const visible = visibility.properties && sourceOk && priceOk;
      if (dot) dot.style.opacity = visible ? '1' : '0';
      el.style.pointerEvents = visible ? 'auto' : 'none';
    }
  }, [visibility.properties, sourceFilter, priceRange, mapLoaded, properties]);

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
  }, [isochrones, mapLoaded]);

  // Intersection layers — create once (fitting the camera), then update the
  // source data in place so the green zone morphs smoothly when the search
  // buffer changes instead of blinking out and re-fitting.
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

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

    if (users.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      users.forEach((user) => bounds.extend([user.longitude, user.latitude]));
      map.current.fitBounds(bounds, { padding: 100 });
    }
  }, [intersection, users, mapLoaded]);

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
