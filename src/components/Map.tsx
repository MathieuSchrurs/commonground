'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { Feature, Polygon, MultiPolygon } from 'geojson';
import { CommuteConstraint } from '@/types/user';
import { PropertyListing } from '@/scraper/types';

interface MapProps {
  users: CommuteConstraint[];
  intersection: Feature<Polygon | MultiPolygon> | null;
  isochrones: Feature<Polygon | MultiPolygon>[];
  properties?: PropertyListing[];
  isLoading?: boolean;
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
};

function formatPrice(price?: number): string {
  if (!price) return 'Price on request';
  return `€${price.toLocaleString('nl-BE')}`;
}

export default function Map({ users, intersection, isochrones, properties = [], isLoading = false }: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [sliderValue, setSliderValue] = useState(300);
  const [panelExpanded, setPanelExpanded] = useState(true);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const markerContainersRef = useRef<HTMLDivElement[]>([]);
  const propertyMarkersRef = useRef<mapboxgl.Marker[]>([]);

  const getInitialVisibility = useCallback((): LayerVisibility => ({
    markers: users.map(() => true),
    isochrones: isochrones.map(() => true),
    intersection: true,
    properties: true,
  }), [users, isochrones]);

  const [visibility, setVisibility] = useState<LayerVisibility>(getInitialVisibility);

  const prevCounts = useRef({ users: users.length, isochrones: isochrones.length });

  useEffect(() => {
    if (users.length !== prevCounts.current.users || isochrones.length !== prevCounts.current.isochrones) {
      prevCounts.current = { users: users.length, isochrones: isochrones.length };
      setVisibility(getInitialVisibility());
    }
  }, [users.length, isochrones.length, getInitialVisibility]);

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN;

  const setLayerTransition = useCallback((duration: number) => {
    if (!map.current) return;
    if (map.current.getLayer('isochrones-fade')) {
      map.current.setPaintProperty('isochrones-fade', 'fill-opacity-transition', { duration });
    }
    if (map.current.getLayer('intersection-fade')) {
      map.current.setPaintProperty('intersection-fade', 'fill-opacity-transition', { duration });
    }
  }, []);

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

  const toggleIntersection = useCallback(() => {
    setVisibility(prev => ({ ...prev, intersection: !prev.intersection }));
  }, []);

  const toggleProperties = useCallback(() => {
    setVisibility(prev => ({ ...prev, properties: !prev.properties }));
  }, []);

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
      center: [-98.5795, 39.8283],
      zoom: 3,
      pitch: 0,
      bearing: 0,
    });

    map.current.on('error', (e) => {
      console.error('Map error:', e.error || e);
    });

    map.current.on('styleimagemissing', (e) => {
      console.warn('Style image missing:', e.id);
    });

    map.current.on('load', async () => {
      try {
        if (map.current?.getSource('composite')) {
          map.current?.addLayer({
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
        }
      } catch (err) {
        console.warn('3D buildings failed to load:', err);
      }

      try {
        map.current?.setFog({
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

      setMapLoaded(true);
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [mapboxToken]);

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

  // Render property markers
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    propertyMarkersRef.current.forEach(m => m.remove());
    propertyMarkersRef.current = [];

    properties.forEach((listing) => {
      if (!listing.latitude || !listing.longitude) return;

      const color = SOURCE_COLORS[listing.source] ?? '#6b7280';

      // Outer marker container
      const el = document.createElement('div');
      el.style.position = 'relative';
      el.style.cursor = 'pointer';
      el.style.transition = 'opacity 300ms ease';

      // House pin
      const pin = document.createElement('div');
      pin.style.width = '28px';
      pin.style.height = '28px';
      pin.style.borderRadius = '50% 50% 50% 0';
      pin.style.transform = 'rotate(-45deg)';
      pin.style.backgroundColor = color;
      pin.style.border = '2px solid white';
      pin.style.boxShadow = '0 2px 6px rgba(0,0,0,0.35)';
      pin.style.display = 'flex';
      pin.style.alignItems = 'center';
      pin.style.justifyContent = 'center';

      const icon = document.createElement('span');
      icon.style.transform = 'rotate(45deg)';
      icon.style.fontSize = '13px';
      icon.textContent = '🏠';
      pin.appendChild(icon);
      el.appendChild(pin);

      // Price badge above the pin
      if (listing.price) {
        const badge = document.createElement('div');
        badge.style.position = 'absolute';
        badge.style.bottom = '32px';
        badge.style.left = '50%';
        badge.style.transform = 'translateX(-50%)';
        badge.style.backgroundColor = color;
        badge.style.color = 'white';
        badge.style.fontSize = '10px';
        badge.style.fontWeight = '700';
        badge.style.padding = '2px 6px';
        badge.style.borderRadius = '10px';
        badge.style.whiteSpace = 'nowrap';
        badge.style.boxShadow = '0 1px 4px rgba(0,0,0,0.25)';
        badge.textContent = formatPrice(listing.price);
        el.appendChild(badge);
      }

      const popupHtml = `
        <div style="max-width:220px;font-family:sans-serif;">
          ${listing.image_url ? `<img src="${listing.image_url}" style="width:100%;height:110px;object-fit:cover;border-radius:4px;margin-bottom:8px;" />` : ''}
          <div style="font-weight:700;font-size:14px;margin-bottom:4px;">${formatPrice(listing.price)}</div>
          ${listing.title ? `<div style="font-size:12px;color:#444;margin-bottom:4px;">${listing.title}</div>` : ''}
          ${listing.address ? `<div style="font-size:11px;color:#666;margin-bottom:6px;">📍 ${listing.address}</div>` : ''}
          <div style="display:flex;gap:8px;font-size:11px;color:#555;margin-bottom:8px;">
            ${listing.bedrooms ? `<span>🛏 ${listing.bedrooms}</span>` : ''}
            ${listing.surface_area ? `<span>📐 ${listing.surface_area} m²</span>` : ''}
            ${listing.land_area ? `<span>🌿 ${listing.land_area} m²</span>` : ''}
          </div>
          <a href="${listing.url}" target="_blank" rel="noopener noreferrer"
             style="display:block;text-align:center;background:${color};color:white;padding:6px 10px;border-radius:4px;font-size:12px;font-weight:600;text-decoration:none;">
            View on ${listing.source.charAt(0).toUpperCase() + listing.source.slice(1)}
          </a>
        </div>
      `;

      if (map.current) {
        const marker = new mapboxgl.Marker(el)
          .setLngLat([Number(listing.longitude), Number(listing.latitude)])
          .setPopup(new mapboxgl.Popup({ offset: 30, maxWidth: '240px' }).setHTML(popupHtml))
          .addTo(map.current);
        propertyMarkersRef.current.push(marker);
      }
    });
  }, [properties, mapLoaded]);

  // Toggle property marker visibility
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    propertyMarkersRef.current.forEach((marker) => {
      const el = marker.getElement();
      if (el) el.style.opacity = visibility.properties ? '1' : '0';
    });
  }, [visibility.properties, mapLoaded]);

  // Layer transition duration
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    setLayerTransition(sliderValue);
  }, [sliderValue, mapLoaded, setLayerTransition]);

  // Isochrone visibility
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

    if (map.current.getLayer('isochrones-fade')) {
      map.current.setLayoutProperty('isochrones-fade', 'visibility', visibility.isochrones.some(v => v) ? 'visible' : 'none');
    }
    if (map.current.getLayer('isochrones-outline-dash')) {
      map.current.setLayoutProperty('isochrones-outline-dash', 'visibility', visibility.isochrones.some(v => v) ? 'visible' : 'none');
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

  // Render isochrones + intersection
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

    ['intersection-fill', 'intersection-outline', 'intersection-fade', 'intersection-outline-dash'].forEach(id => {
      if (map.current?.getLayer(id)) map.current.removeLayer(id);
    });
    if (map.current.getSource('intersection')) map.current.removeSource('intersection');

    isochrones.forEach((isochrone, index) => {
      const color = COLORS[index % COLORS.length];
      const sourceId = `isochrone-${index}`;

      map.current?.addSource(sourceId, { type: 'geojson', data: isochrone });
      map.current?.addLayer({ id: `${sourceId}-fill`, type: 'fill', source: sourceId, paint: { 'fill-color': color, 'fill-opacity': 0 } });
      map.current?.addLayer({ id: `${sourceId}-outline`, type: 'line', source: sourceId, paint: { 'line-color': color, 'line-width': 2 } });
    });

    const allIsochroneFeatures = isochrones.map((iso, idx) => ({
      ...iso,
      properties: { ...iso.properties, color: COLORS[idx % COLORS.length] }
    }));

    if (allIsochroneFeatures.length > 0) {
      map.current?.addSource('isochrones-combined', { type: 'geojson', data: { type: 'FeatureCollection', features: allIsochroneFeatures } });
      map.current?.addLayer({ id: 'isochrones-fade', type: 'fill', source: 'isochrones-combined', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.4, 'fill-opacity-transition': { duration: 300 } } });
      map.current?.addLayer({ id: 'isochrones-outline-dash', type: 'line', source: 'isochrones-combined', paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-dasharray': [2, 1] } });
    }

    if (intersection) {
      map.current.addSource('intersection', { type: 'geojson', data: intersection });
      map.current.addLayer({ id: 'intersection-fill', type: 'fill', source: 'intersection', paint: { 'fill-color': '#22c55e', 'fill-opacity': 0 } });
      map.current.addLayer({ id: 'intersection-fade', type: 'fill', source: 'intersection', paint: { 'fill-color': '#22c55e', 'fill-opacity': 0.5, 'fill-opacity-transition': { duration: 300 } } });
      map.current.addLayer({ id: 'intersection-outline', type: 'line', source: 'intersection', paint: { 'line-color': '#16a34a', 'line-width': 3 } });
      map.current.addLayer({ id: 'intersection-outline-dash', type: 'line', source: 'intersection', paint: { 'line-color': '#16a34a', 'line-width': 2, 'line-dasharray': [2, 1], 'line-opacity': 0.6 } });

      const bounds = new mapboxgl.LngLatBounds();
      const coords = intersection.geometry.coordinates;
      if (intersection.geometry.type === 'Polygon') {
        (coords as number[][][])[0].forEach((coord) => bounds.extend([coord[0], coord[1]]));
      } else {
        (coords as number[][][][]).forEach((polygon) => polygon[0].forEach((coord) => bounds.extend([coord[0], coord[1]])));
      }
      if (!bounds.isEmpty()) map.current.fitBounds(bounds, { padding: 50 });
    } else if (users.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      users.forEach((user) => bounds.extend([user.longitude, user.latitude]));
      map.current.fitBounds(bounds, { padding: 100 });
    }
  }, [users, isochrones, intersection, mapLoaded]);

  if (!mapboxToken) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        Error: Mapbox public token not configured. Please set NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN in your environment.
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[500px] rounded-lg overflow-hidden">
      <div ref={mapContainer} className="w-full h-full" />

      <button
        onClick={() => setPanelExpanded(!panelExpanded)}
        style={{
          position: 'absolute', top: 10, left: 10, zIndex: 20,
          width: '40px', height: '40px', borderRadius: '8px', border: 'none',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '20px', backdropFilter: 'blur(4px)',
        }}
        title={panelExpanded ? 'Collapse panel' : 'Show layer controls'}
      >
        👁
      </button>

      {panelExpanded && (
        <div style={{
          font: `12px/20px 'Helvetica Neue', Arial, Helvetica, sans-serif`,
          position: 'absolute', width: '240px', top: 10, left: 60, zIndex: 10,
          maxHeight: 'calc(100% - 20px)', overflowY: 'auto',
        }}>
          {/* Layer controls */}
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            borderRadius: '8px', padding: '12px', marginBottom: '10px',
            backdropFilter: 'blur(4px)',
          }}>
            <h2 style={{ fontSize: '14px', fontWeight: 'bold', lineHeight: '20px', display: 'block', margin: '0 0 12px', color: '#333', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>
              Layer Controls
            </h2>

            {users.length > 0 && (
              <>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#666', marginBottom: '6px' }}>MARKERS ({users.length})</div>
                {users.map((user, index) => (
                  <label key={`marker-${index}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', cursor: 'pointer', fontSize: '13px' }}>
                    <input type="checkbox" checked={visibility.markers[index] ?? true} onChange={() => toggleMarker(index)} style={{ cursor: 'pointer' }} />
                    <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: COLORS[index % COLORS.length], flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</span>
                  </label>
                ))}
              </>
            )}

            {isochrones.length > 0 && (
              <>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#666', margin: '12px 0 6px', borderTop: '1px solid #eee', paddingTop: '12px' }}>ISOCHRONES ({isochrones.length})</div>
                {isochrones.map((_, index) => (
                  <label key={`isochrone-${index}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', cursor: 'pointer', fontSize: '13px' }}>
                    <input type="checkbox" checked={visibility.isochrones[index] ?? true} onChange={() => toggleIsochrone(index)} style={{ cursor: 'pointer' }} />
                    <span style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: COLORS[index % COLORS.length], flexShrink: 0 }} />
                    <span>Zone {index + 1}</span>
                  </label>
                ))}
              </>
            )}

            {intersection && (
              <>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#666', margin: '12px 0 6px', borderTop: '1px solid #eee', paddingTop: '12px' }}>INTERSECTION</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', cursor: 'pointer', fontSize: '13px' }}>
                  <input type="checkbox" checked={visibility.intersection} onChange={toggleIntersection} style={{ cursor: 'pointer' }} />
                  <span style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: '#22c55e', flexShrink: 0 }} />
                  <span>Common Area</span>
                </label>
              </>
            )}

            {properties.length > 0 && (
              <>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#666', margin: '12px 0 6px', borderTop: '1px solid #eee', paddingTop: '12px' }}>PROPERTIES ({properties.length})</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', cursor: 'pointer', fontSize: '13px' }}>
                  <input type="checkbox" checked={visibility.properties} onChange={toggleProperties} style={{ cursor: 'pointer' }} />
                  <span style={{ fontSize: '12px' }}>🏠</span>
                  <span>For Sale</span>
                </label>
                <div style={{ display: 'flex', gap: '12px', marginTop: '4px', paddingLeft: '24px', fontSize: '11px', color: '#888' }}>
                  {properties.some(p => p.source === 'immoweb') && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: SOURCE_COLORS.immoweb, display: 'inline-block' }} />
                      Immoweb
                    </span>
                  )}
                  {properties.some(p => p.source === 'zimmo') && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: SOURCE_COLORS.zimmo, display: 'inline-block' }} />
                      Zimmo
                    </span>
                  )}
                  {properties.some(p => p.source === 'realo') && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: SOURCE_COLORS.realo, display: 'inline-block' }} />
                      Realo
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Fade controls */}
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            borderRadius: '8px', padding: '12px', backdropFilter: 'blur(4px)',
          }}>
            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#666', marginBottom: '6px' }}>
                Fade Duration: {sliderValue}ms
              </label>
              <input type="range" min="0" max="1000" step="50" value={sliderValue} onChange={(e) => setSliderValue(parseInt(e.target.value))} style={{ width: '100%', cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={fadeAllIn} style={{ flex: 1, height: '32px', padding: '6px', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: '500', color: '#fff', background: '#22c55e', cursor: 'pointer' }}
                onMouseOver={(e) => e.currentTarget.style.background = '#16a34a'}
                onMouseOut={(e) => e.currentTarget.style.background = '#22c55e'}>
                Show All
              </button>
              <button onClick={fadeAllOut} style={{ flex: 1, height: '32px', padding: '6px', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: '500', color: '#fff', background: '#ef4444', cursor: 'pointer' }}
                onMouseOver={(e) => e.currentTarget.style.background = '#dc2626'}
                onMouseOut={(e) => e.currentTarget.style.background = '#ef4444'}>
                Hide All
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-30">
          <div className="bg-white rounded-lg p-4 shadow-lg flex items-center gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span className="text-gray-700">Loading...</span>
          </div>
        </div>
      )}
    </div>
  );
}
