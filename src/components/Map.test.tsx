// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { CommuteConstraint } from '@/types/user';
import { PropertyListing } from '@/scraper/types';

// A minimal fake of the mapbox-gl surface Map.tsx touches. Real Mapbox needs
// WebGL, which jsdom has no concept of — this mock only exists to let the
// component mount and run its effects safely, not to reproduce real map
// rendering. `on('load', cb)` fires synchronously so mapLoaded flips true
// within the same render() call, and every method chains via `return this`
// the way the real mapbox-gl API does.
//
// Listings are drawn from a clustered GeoJSON source, not from marker DOM
// nodes, so the source is where this file observes them: `addSource` keeps a
// fake source per id and `setData` records what Map.tsx last handed it.
// (Clustering itself is real mapbox-gl behaviour and is covered in the
// browser by map.spec.ts — there's nothing to fake here.)
let createdMaps: FakeMap[] = [];
let createdMarkers: FakeMarker[] = [];

interface ListingFeature {
  geometry: { type: string; coordinates: [number, number] };
  properties: Record<string, unknown>;
}

class FakeGeoJSONSource {
  data: unknown;
  constructor(spec: { data?: unknown }) { this.data = spec.data; }
  setData(data: unknown) { this.data = data; return this; }
}

class FakeMarker {
  private el: HTMLElement;
  private popup: FakePopup | null = null;
  constructor(el?: HTMLElement) {
    this.el = el ?? document.createElement('div');
    createdMarkers.push(this);
  }
  setLngLat() { return this; }
  setPopup(p: FakePopup) { this.popup = p; return this; }
  addTo() { return this; }
  remove() { return this; }
  getElement() { return this.el; }
  getPopup() { return this.popup; }
}

class FakePopup {
  private isOpenState = false;
  setDOMContent() { return this; }
  setHTML() { return this; }
  on() { return this; }
  isOpen() { return this.isOpenState; }
  remove() { this.isOpenState = false; return this; }
}

class FakeMap {
  sources: Record<string, FakeGeoJSONSource> = {};
  constructor() { createdMaps.push(this); }
  // Layer-scoped listeners (`on('click', layerId, cb)`) pass three arguments;
  // only the map-level 'load' matters here.
  on(event: string, cb: (e?: unknown) => void) {
    if (event === 'load') cb();
    return this;
  }
  addControl() { return this; }
  addSource(id: string, spec: { data?: unknown }) {
    this.sources[id] = new FakeGeoJSONSource(spec);
    return this;
  }
  removeSource(id: string) { delete this.sources[id]; return this; }
  addLayer() { return this; }
  removeLayer() { return this; }
  getSource(id: string) { return this.sources[id]; }
  getLayer() { return undefined; }
  getCanvas() { return { style: {} as CSSStyleDeclaration }; }
  setFilter() { return this; }
  setLayoutProperty() { return this; }
  setPaintProperty() { return this; }
  resize() { return this; }
  remove() { return this; }
  fitBounds() { return this; }
  flyTo() { return this; }
  easeTo() { return this; }
  setFog() { return this; }
}

class FakeLngLatBounds {
  extend() { return this; }
}

vi.mock('mapbox-gl', () => ({
  default: {
    accessToken: '',
    Map: FakeMap,
    Marker: FakeMarker,
    Popup: FakePopup,
    NavigationControl: class {},
    LngLatBounds: FakeLngLatBounds,
  },
}));

// jsdom has no ResizeObserver; Map.tsx uses one to keep the canvas sized to
// its container.
class FakeResizeObserver {
  observe() {}
  disconnect() {}
}

let MapComponent: typeof import('./Map').default;

beforeEach(async () => {
  createdMaps = [];
  createdMarkers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.stubEnv('NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN', 'test-token');
  // Import after the env var and mocks are in place — Map.tsx reads
  // process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN at module-eval time via a
  // component-body `const`, which is fine (it's read per-render, not once at
  // import time), but importing fresh keeps this test independent of import
  // order relative to other test files.
  MapComponent = (await import('./Map')).default;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function listing(id: string, property_type: PropertyListing['property_type']): PropertyListing {
  return {
    id,
    source: 'immoweb',
    external_id: id,
    url: `https://example.com/${id}`,
    property_type,
    latitude: 51.05,
    longitude: 3.72,
  };
}

function participant(id: string, hideCommercial?: boolean): CommuteConstraint {
  return {
    id,
    name: id,
    address: 'x',
    latitude: 51.0,
    longitude: 3.7,
    maxMinutes: 30,
    transportMode: 'driving',
    hideCommercial,
  };
}

// The listings the map is currently drawing: the feature collection last
// handed to the clustered 'listings' source. Filtering happens by feeding the
// source only the listings that pass — there is no per-listing DOM node left
// to restyle — so this is where "which listings are on the map" is readable.
function listingFeatures(): ListingFeature[] {
  const source = createdMaps.at(-1)?.getSource('listings');
  const data = source?.data as { features?: ListingFeature[] } | undefined;
  return data?.features ?? [];
}

function listingKeys(): string[] {
  return listingFeatures().map((f) => f.properties.listingKey as string);
}

describe('Map — commercial-listing visibility', () => {
  it('leaves a commercial listing out of the map data when the viewer hides commercial listings', () => {
    const properties = [listing('office-1', 'commercial'), listing('house-1', 'house')];
    const users = [participant('me', true)];

    render(<MapComponent users={users} intersection={null} isochrones={[]} properties={properties} myUserId="me" />);

    expect(listingKeys()).toEqual(['immoweb:house-1']);
  });

  it('includes a commercial listing when the viewer has not hidden it', () => {
    const properties = [listing('office-1', 'commercial')];
    const users = [participant('me', false)];

    render(<MapComponent users={users} intersection={null} isochrones={[]} properties={properties} myUserId="me" />);

    expect(listingKeys()).toEqual(['immoweb:office-1']);
  });

  it('renders no marker DOM node for a listing', () => {
    const properties = [listing('house-1', 'house'), listing('house-2', 'house')];

    render(<MapComponent users={[]} intersection={null} isochrones={[]} properties={properties} />);

    expect(listingKeys()).toEqual(['immoweb:house-1', 'immoweb:house-2']);
    // No participants either, so every marker created would be a listing's.
    expect(createdMarkers).toHaveLength(0);
  });
});
