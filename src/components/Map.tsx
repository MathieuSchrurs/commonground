'use client';

import React, { useEffect, useState, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Feature, Polygon, MultiPolygon } from 'geojson';
import { CommuteConstraint } from '@/types/user';

interface MapProps {
  users: CommuteConstraint[];
  intersection: Feature<Polygon | MultiPolygon> | null;
  isochrones: Feature<Polygon | MultiPolygon>[];
  isLoading?: boolean;
}

const COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#96CEB4', // Green
  '#FFEAA7', // Yellow
  '#DDA0DD', // Plum
  '#98D8C8', // Mint
  '#F7DC6F', // Gold
];

export default function Map({ users, intersection, isochrones, isLoading = false }: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN;

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current || !mapboxToken) return;

    mapboxgl.accessToken = mapboxToken;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-98.5795, 39.8283], // Center of US
      zoom: 3,
    });

    map.current.on('load', () => {
      setMapLoaded(true);
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [mapboxToken]);

  // Update map when data changes
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Clear existing layers and sources
    const existingSources = ['intersection', ...users.map((_, i) => `isochrone-${i}`)];
    existingSources.forEach((sourceId) => {
      if (map.current?.getLayer(`${sourceId}-fill`)) {
        map.current.removeLayer(`${sourceId}-fill`);
      }
      if (map.current?.getLayer(`${sourceId}-outline`)) {
        map.current.removeLayer(`${sourceId}-outline`);
      }
      if (map.current?.getSource(sourceId)) {
        map.current.removeSource(sourceId);
      }
    });

    // Add user markers
    users.forEach((user, index) => {
      const color = COLORS[index % COLORS.length];
      const transportIcon = user.transportMode === 'driving' ? '🚗' : '🚲';
      
      // Create marker element
      const el = document.createElement('div');
      el.className = 'user-marker';
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
      el.textContent = (index + 1).toString();

      // Add transport icon badge
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
        new mapboxgl.Marker(el)
          .setLngLat([user.longitude, user.latitude])
          .setPopup(
            new mapboxgl.Popup({ offset: 25 }).setHTML(
              `<strong>${user.name}</strong><br/>${user.address}<br/>Max: ${user.maxMinutes} min<br/>${transportIcon} ${user.transportMode === 'driving' ? 'Car' : 'Bike'}`
            )
          )
          .addTo(map.current);
      }
    });

    // Add isochrone polygons
    isochrones.forEach((isochrone, index) => {
      const color = COLORS[index % COLORS.length];
      const sourceId = `isochrone-${index}`;

      map.current?.addSource(sourceId, {
        type: 'geojson',
        data: isochrone,
      });

      map.current?.addLayer({
        id: `${sourceId}-fill`,
        type: 'fill',
        source: sourceId,
        paint: {
          'fill-color': color,
          'fill-opacity': 0.3,
        },
      });

      map.current?.addLayer({
        id: `${sourceId}-outline`,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': color,
          'line-width': 2,
        },
      });
    });

    // Add intersection polygon
    if (intersection) {
      map.current.addSource('intersection', {
        type: 'geojson',
        data: intersection,
      });

      map.current.addLayer({
        id: 'intersection-fill',
        type: 'fill',
        source: 'intersection',
        paint: {
          'fill-color': '#22c55e',
          'fill-opacity': 0.5,
        },
      });

      map.current.addLayer({
        id: 'intersection-outline',
        type: 'line',
        source: 'intersection',
        paint: {
          'line-color': '#16a34a',
          'line-width': 3,
        },
      });

      // Fit bounds to intersection
      const bounds = new mapboxgl.LngLatBounds();
      const coords = intersection.geometry.coordinates;
      
      if (intersection.geometry.type === 'Polygon') {
        (coords as number[][][])[0].forEach((coord) => {
          bounds.extend([coord[0], coord[1]]);
        });
      } else {
        (coords as number[][][][]).forEach((polygon) => {
          polygon[0].forEach((coord) => {
            bounds.extend([coord[0], coord[1]]);
          });
        });
      }

      if (!bounds.isEmpty()) {
        map.current.fitBounds(bounds, { padding: 50 });
      }
    } else if (users.length > 0) {
      // Fit bounds to all user markers
      const bounds = new mapboxgl.LngLatBounds();
      users.forEach((user) => {
        bounds.extend([user.longitude, user.latitude]);
      });
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
      
      {isLoading && (
        <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
          <div className="bg-white rounded-lg p-4 shadow-lg flex items-center gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span className="text-gray-700">Loading...</span>
          </div>
        </div>
      )}
    </div>
  );
}
