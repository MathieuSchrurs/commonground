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
// Map.tsx creates each marker's `el` with `document.createElement` and never
// attaches it to the React-rendered tree — production code hands it to
// mapbox-gl's real internals instead. `addTo()` is a no-op here, so there's
// nothing for a DOM query against the render()ed container to find; track
// created markers directly instead. `properties.forEach` creates them in
// array order, so `createdMarkers[i]` corresponds to `properties[i]`.
let createdMarkers: FakeMarker[] = [];

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
  on(event: string, cb: (e?: unknown) => void) {
    if (event === 'load') cb();
    return this;
  }
  addControl() { return this; }
  addSource() { return this; }
  removeSource() { return this; }
  addLayer() { return this; }
  removeLayer() { return this; }
  getSource() { return undefined; }
  getLayer() { return undefined; }
  setFilter() { return this; }
  setLayoutProperty() { return this; }
  setPaintProperty() { return this; }
  resize() { return this; }
  remove() { return this; }
  fitBounds() { return this; }
  flyTo() { return this; }
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

// Map.tsx also creates one marker per commuter (a numbered pin at their
// address), from a separate effect than the property-listing dots. A
// commuter marker sets its own `el.textContent` (the number badge); a
// property dot never sets text directly on `el` — only its unlabelled child
// `dot` div — so `el.textContent === ''` reliably isolates property markers
// from commuter markers regardless of how many of each exist or which effect
// ran first.
function propertyMarkers(): FakeMarker[] {
  return createdMarkers.filter((m) => m.getElement().textContent === '');
}

describe('Map — commercial-listing marker visibility', () => {
  it("fades a commercial listing's marker when the viewer hides commercial listings", () => {
    const properties = [listing('office-1', 'commercial'), listing('house-1', 'house')];
    const users = [participant('me', true)];

    render(<MapComponent users={users} intersection={null} isochrones={[]} properties={properties} myUserId="me" />);

    const [office, house] = propertyMarkers();
    expect(propertyMarkers()).toHaveLength(2);

    const officeDot = office.getElement().firstElementChild as HTMLElement;
    const houseDot = house.getElement().firstElementChild as HTMLElement;

    expect(officeDot.style.opacity).toBe('0');
    expect(houseDot.style.opacity).toBe('1');
  });

  it("shows a commercial listing's marker when the viewer has not hidden it", () => {
    const properties = [listing('office-1', 'commercial')];
    const users = [participant('me', false)];

    render(<MapComponent users={users} intersection={null} isochrones={[]} properties={properties} myUserId="me" />);

    const [office] = propertyMarkers();
    expect(propertyMarkers()).toHaveLength(1);

    const officeDot = office.getElement().firstElementChild as HTMLElement;
    expect(officeDot.style.opacity).toBe('1');
  });
});
