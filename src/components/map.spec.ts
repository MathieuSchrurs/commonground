import { test, expect } from '@playwright/test';
import {
  LISTING_COUNT,
  MANY_LISTING_COUNT,
  POPUP_TARGET_LISTING,
  ISOCHRONE_FIXTURES,
  INTERSECTION_FIXTURE,
  PARTICIPANT_FIXTURES,
  type Default,
  type ManyListings,
  type WithReactions,
  type WithZones,
  type WithParticipants,
  type WithHalos,
} from './Map.story';

// Listing pins are a clustered GeoJSON layer, and the individual-listing
// popup opened on click is a `mapboxgl.Popup`, not a `mapboxgl.Marker` — so a
// listings-only story with nothing clicked has zero real marker DOM nodes,
// regardless of listing count.
const MAX_LISTING_DOM_MARKERS = 0;

// Minimal shape of the window globals the stories record — avoids pulling the
// mapbox-gl types into code that runs inside page.evaluate.
type GeoJSONSourceLike = { setData: (data: unknown) => void };
type RenderedFeature = { properties?: Record<string, unknown> | null };
type MapWindow = typeof globalThis & {
  __mapForTest?: {
    getSource: (id: string) => GeoJSONSourceLike | undefined;
    getLayer: (id: string) => unknown;
    setZoom: (zoom: number) => void;
    setCenter: (center: [number, number]) => void;
    project: (lngLat: [number, number]) => { x: number; y: number };
    once: (event: string, cb: () => void) => void;
    queryRenderedFeatures: (options: { layers: string[] }) => RenderedFeature[];
  };
  __isoSourceBefore?: unknown;
  __intersectionSourceBefore?: unknown;
  __intersectionSetDataCalls?: number;
  __listingSourceBefore?: unknown;
  __listingSetDataCalls?: number;
  __mapIdleCount?: number;
};

// The stories count 'idle' events off the live map. Waiting for one before
// counting marker DOM nodes is what makes "there are no per-listing markers"
// a real assertion rather than one that passes at t=0 because nothing has
// been drawn yet.
async function waitForMapIdle(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => ((window as MapWindow).__mapIdleCount ?? 0) > 0, undefined, {
    timeout: 15000,
  });
}

// Ids of the source and layers Map.tsx renders listings through. Hardcoded
// here (as 'isochrones-combined' already is below) because they're part of
// what this spec pins down, not incidental detail.
const LISTING_SOURCE = 'listings';
const CLUSTER_LAYER = 'listings-clusters';
const POINT_LAYER = 'listings-unclustered';
const UNANIMOUS_HALO_LAYER = 'listings-unanimous';
const NEW_HALO_LAYER = 'listings-new';

// mapbox-gl is real here (not mocked like the jsdom Map.test.tsx) — the
// whole point of a browser-based test is to exercise its actual clustering
// engine, not a fake Marker/Popup pair. Only the network is mocked, so this
// costs no real Mapbox API usage: a minimal valid style (no sources/layers)
// is enough for the library to fire 'load'; everything Map.tsx itself adds
// on top (markers, isochrone layers) uses inline GeoJSON data, not a URL, so
// nothing else needs mocking for the map to become interactive.
// A glyphs protobuf holding a single empty fontstack ("Arial", range
// "0-255"): `fontstack{ name=1, range=2 }` wrapped in `glyphs{ stacks=1 }`.
const EMPTY_GLYPH_PBF = Buffer.from([
  0x0a, 0x0e,
  0x0a, 0x05, 0x41, 0x72, 0x69, 0x61, 0x6c,
  0x12, 0x05, 0x30, 0x2d, 0x32, 0x35, 0x35,
]);

async function mockMapbox(page: import('@playwright/test').Page) {
  await page.route('**/api.mapbox.com/styles/v1/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        version: 8,
        sources: {},
        layers: [],
        // The cluster-count layer is a symbol layer, and mapbox-gl refuses to
        // lay out text for a style with no glyphs endpoint. Point it at the
        // (mocked, below) font endpoint so the layer is valid; the labels
        // themselves aren't what any test here asserts on.
        glyphs: 'https://api.mapbox.com/fonts/v1/mapbox/{fontstack}/{range}.pbf',
        sprite: undefined,
      }),
    })
  );
  // Glyph ranges. This has to be a *valid* glyphs protobuf (one fontstack,
  // no glyphs in it) rather than an empty body: mapbox-gl fails the whole
  // tile when glyph parsing throws, which silently takes the circle layers
  // sharing that tile down with it. The labels themselves don't render — no
  // test here asserts on them — but every other layer does.
  await page.route('**/api.mapbox.com/fonts/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/x-protobuf', body: EMPTY_GLYPH_PBF })
  );
  // Telemetry/analytics — not needed for the map to function, just quieted.
  await page.route('**/events.mapbox.com/**', (route) => route.fulfill({ status: 204, body: '' }));
}

test.describe('Map story gallery', () => {
  test('renders listings through a clustered layer, not one DOM marker per listing', async ({ page, mount }) => {
    await mockMapbox(page);

    // 24 listings first, then 1500 — the point of asserting the same bound
    // for both is that the DOM-marker count does not track the listing count.
    const small = await mount<typeof Default>('components/Map/Default');
    await expect(small.locator('.mapboxgl-canvas')).toBeVisible({ timeout: 15000 });
    await waitForMapIdle(page);
    expect(LISTING_COUNT).toBeGreaterThan(MAX_LISTING_DOM_MARKERS);
    expect(await small.locator('.mapboxgl-marker').count()).toBeLessThanOrEqual(MAX_LISTING_DOM_MARKERS);

    const many = await mount<typeof ManyListings>('components/Map/ManyListings');
    await expect(many.locator('.mapboxgl-canvas')).toBeVisible({ timeout: 15000 });
    await waitForMapIdle(page);
    expect(await many.locator('.mapboxgl-marker').count()).toBeLessThanOrEqual(MAX_LISTING_DOM_MARKERS);

    // …and the listings are genuinely on the map rather than simply absent:
    // the clustered source exists and its layers render features.
    await page.waitForFunction(
      ([sourceId, clusterLayer, pointLayer]) => {
        const map = (window as MapWindow).__mapForTest;
        if (!map?.getSource(sourceId) || !map.getLayer(clusterLayer)) return false;
        return map.queryRenderedFeatures({ layers: [clusterLayer, pointLayer] }).length > 0;
      },
      [LISTING_SOURCE, CLUSTER_LAYER, POINT_LAYER],
      { timeout: 15000 }
    );
  });

  test('clusters listings at low zoom and shows them individually at high zoom', async ({ page, mount }) => {
    await mockMapbox(page);

    const component = await mount<typeof ManyListings>('components/Map/ManyListings');
    await expect(component.locator('.mapboxgl-canvas')).toBeVisible({ timeout: 15000 });
    await page.waitForFunction(
      (sourceId) => !!(window as MapWindow).__mapForTest?.getSource(sourceId),
      LISTING_SOURCE,
      { timeout: 15000 }
    );

    const counts = await page.evaluate(async ([clusterLayer, pointLayer]) => {
      const map = (window as MapWindow).__mapForTest!;
      const countAt = (zoom: number) =>
        new Promise<{ clusters: number; points: number }>((resolve) => {
          map.once('idle', () =>
            resolve({
              clusters: map.queryRenderedFeatures({ layers: [clusterLayer] }).length,
              points: map.queryRenderedFeatures({ layers: [pointLayer] }).length,
            })
          );
          map.setZoom(zoom);
        });
      // Zoom 4 puts the whole ~1km fixture inside a single pixel; zoom 15 is
      // past the cluster max zoom and wide enough to hold all of it.
      const low = await countAt(4);
      const high = await countAt(15);
      return { low, high };
    }, [CLUSTER_LAYER, POINT_LAYER]);

    // Low zoom: everything is aggregated — a handful of clusters standing in
    // for 1500 listings, and no individual pins.
    expect(counts.low.points).toBe(0);
    expect(counts.low.clusters).toBeGreaterThan(0);
    expect(counts.low.clusters).toBeLessThan(MANY_LISTING_COUNT / 10);

    // High zoom: the clusters have broken up into the individual listings.
    expect(counts.high.clusters).toBe(0);
    expect(counts.high.points).toBeGreaterThanOrEqual(MANY_LISTING_COUNT * 0.8);
  });

  test('a listing that is both unanimous and new shows both halo rings, not just one', async ({ page, mount }) => {
    await mockMapbox(page);

    // A single layer choosing one color via a binary `case` expression would
    // pick unanimous over new (or vice versa) for a listing that's both —
    // silently dropping one ring. Two separate layers, one per condition, is
    // what this asserts: both should render for the same feature.
    const component = await mount<typeof WithHalos>('components/Map/WithHalos', { unanimous: true, isNew: true });
    await expect(component.locator('.mapboxgl-canvas')).toBeVisible({ timeout: 15000 });
    await waitForMapIdle(page);

    const counts = await page.evaluate(([unanimousLayer, newLayer, lng, lat]) => {
      const map = (window as MapWindow).__mapForTest!;
      return new Promise<{ unanimous: number; new: number }>((resolve) => {
        // Center on the target listing, not just zoom in — the source
        // clusters below zoom 14 (Map.tsx's clusterMaxZoom), and even past
        // that, queryRenderedFeatures only sees what's actually inside the
        // current viewport. Same pattern the popup-click test below uses to
        // reliably land on this exact listing.
        map.once('idle', () =>
          resolve({
            unanimous: map.queryRenderedFeatures({ layers: [unanimousLayer as string] }).length,
            new: map.queryRenderedFeatures({ layers: [newLayer as string] }).length,
          })
        );
        map.setCenter([lng as number, lat as number]);
        map.setZoom(16);
      });
    }, [UNANIMOUS_HALO_LAYER, NEW_HALO_LAYER, POPUP_TARGET_LISTING.longitude!, POPUP_TARGET_LISTING.latitude!]);

    expect(counts).toEqual({ unanimous: 1, new: 1 });
  });

  test('an unrelated prop change does not tear down and recreate the listing source', async ({ page, mount }) => {
    await mockMapbox(page);

    const component = await mount<typeof Default>('components/Map/Default', { myUserId: 'me' });
    await expect(component.locator('.mapboxgl-canvas')).toBeVisible({ timeout: 15000 });
    await page.waitForFunction(
      (sourceId) => !!(window as MapWindow).__mapForTest?.getSource(sourceId),
      LISTING_SOURCE,
      { timeout: 15000 }
    );

    // The listing pins are canvas-rendered, so there are no DOM nodes to tag
    // the way the participant-marker test does. Capture the source by
    // identity instead, and wrap setData to count calls — a filter change is
    // supposed to re-`setData` the same source, never to replace it, and a
    // change that touches no filter should do neither.
    await page.evaluate((sourceId) => {
      const w = window as MapWindow;
      const source = w.__mapForTest!.getSource(sourceId)!;
      w.__listingSourceBefore = source;
      w.__listingSetDataCalls = 0;
      const originalSetData = source.setData.bind(source);
      source.setData = (data: unknown) => {
        w.__listingSetDataCalls = (w.__listingSetDataCalls ?? 0) + 1;
        return originalSetData(data);
      };
    }, LISTING_SOURCE);

    // myUserId decides whose hide-commercial preference applies; with no
    // participants it resolves the same either way, so nothing about which
    // listings are shown changes. update() re-renders the same mounted story
    // in place (no navigation, no remount), exactly the prop-change path
    // Map.tsx sees when a participant is selected/deselected.
    await component.update({ myUserId: 'someone-else' });

    const result = await page.evaluate((sourceId) => {
      const w = window as MapWindow;
      return {
        listingSourceUnchanged: w.__mapForTest!.getSource(sourceId) === w.__listingSourceBefore,
        listingSetDataCalls: w.__listingSetDataCalls,
      };
    }, LISTING_SOURCE);

    expect(result).toEqual({ listingSourceUnchanged: true, listingSetDataCalls: 0 });
  });

  test('an unrelated re-render does not tear down and recreate the isochrone/intersection layers', async ({ page, mount }) => {
    await mockMapbox(page);

    const component = await mount<typeof WithZones>('components/Map/WithZones', {
      isochrones: ISOCHRONE_FIXTURES,
      intersection: INTERSECTION_FIXTURE,
      users: PARTICIPANT_FIXTURES,
    });
    await expect(component.locator('.mapboxgl-canvas')).toBeVisible({ timeout: 15000 });

    // Wait for both sources to exist before capturing their identity.
    await page.waitForFunction(() => {
      const map = (window as MapWindow).__mapForTest;
      return !!map?.getSource('isochrones-combined') && !!map?.getSource('intersection');
    }, { timeout: 15000 });

    // Intersection is created once and then updated in place via `setData` —
    // its source identity survives a rebuild-avoidance regression either way
    // (setData never replaces the source object), so identity alone can't
    // tell a fixed effect from a broken one here. Instead, wrap `setData` to
    // count calls: the effect re-running on an unrelated update (the bug)
    // calls it even though the content hasn't changed; skipping the effect
    // (the fix) doesn't call it at all.
    await page.evaluate(() => {
      const w = window as MapWindow;
      const isoSource = w.__mapForTest!.getSource('isochrones-combined');
      const intersectionSource = w.__mapForTest!.getSource('intersection')!;
      w.__isoSourceBefore = isoSource;
      w.__intersectionSourceBefore = intersectionSource;
      w.__intersectionSetDataCalls = 0;
      const originalSetData = intersectionSource.setData.bind(intersectionSource);
      intersectionSource.setData = (data: unknown) => {
        w.__intersectionSetDataCalls = (w.__intersectionSetDataCalls ?? 0) + 1;
        return originalSetData(data);
      };
    });

    // Sending the exact same fixtures through update() still crosses the
    // mount/update page.evaluate boundary, so the browser receives brand new
    // isochrones/intersection/users object references with unchanged content —
    // exactly what an unrelated re-render produces in the real app. `users` is
    // included deliberately: the intersection effect's no-overlap fallback
    // branch reads `users` for its camera-fit, and a naive fix that keeps
    // `users` itself in that effect's dependency array would still re-run (and
    // re-`setData`) on exactly this update even though isochrones/intersection
    // content is unchanged — this is the shape of "renaming a participant".
    await component.update({ isochrones: ISOCHRONE_FIXTURES, intersection: INTERSECTION_FIXTURE, users: PARTICIPANT_FIXTURES });

    const result = await page.evaluate(() => {
      const w = window as MapWindow;
      return {
        isochronesSourceUnchanged: w.__mapForTest!.getSource('isochrones-combined') === w.__isoSourceBefore,
        intersectionSourceUnchanged: w.__mapForTest!.getSource('intersection') === w.__intersectionSourceBefore,
        intersectionSetDataCalls: w.__intersectionSetDataCalls,
      };
    });

    expect(result).toEqual({
      isochronesSourceUnchanged: true,
      intersectionSourceUnchanged: true,
      intersectionSetDataCalls: 0,
    });
  });

  test('an unrelated re-render does not tear down and recreate participant markers', async ({ page, mount }) => {
    await mockMapbox(page);

    const component = await mount<typeof WithParticipants>('components/Map/WithParticipants', { users: PARTICIPANT_FIXTURES });
    await expect(component.locator('.user-marker')).toHaveCount(PARTICIPANT_FIXTURES.length, { timeout: 15000 });

    // Tag the live marker nodes so the check below is "these exact nodes
    // survived", not just "the count still matches" — a naive tear-down and
    // recreate would still land on the same count with a fresh set of nodes.
    const idsBefore = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('.user-marker'));
      nodes.forEach((el, i) => el.setAttribute('data-test-marker-id', String(i)));
      return nodes.map((_, i) => String(i));
    });

    // Sending the exact same fixture through update() still crosses the
    // mount/update page.evaluate boundary, so the browser receives a brand
    // new `users` array reference with unchanged content — exactly what an
    // unrelated re-render produces in the real app (e.g. a household-pairing
    // field changing, or any other state unrelated to any participant's
    // position/color/transport-mode/name). Map.tsx should leave the existing
    // marker DOM nodes alone.
    await component.update({ users: PARTICIPANT_FIXTURES });

    await expect(component.locator('.user-marker')).toHaveCount(PARTICIPANT_FIXTURES.length, { timeout: 15000 });
    const idsAfter = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.user-marker')).map((el) => el.getAttribute('data-test-marker-id'))
    );

    expect(idsAfter.sort()).toEqual(idsBefore.sort());
  });

  test('clicking an individual listing point opens a popup with working love/object controls', async ({ page, mount }) => {
    await mockMapbox(page);

    const component = await mount<typeof WithReactions>('components/Map/WithReactions', { myUserId: 'me' });
    await expect(component.locator('.mapboxgl-canvas')).toBeVisible({ timeout: 15000 });
    await waitForMapIdle(page);

    // Center and zoom in on the known target listing so it renders as an
    // individual unclustered point rather than part of a cluster, then wait
    // for the map to settle before projecting its screen position — clicking
    // before that risks the pin not having re-drawn at the new zoom yet.
    await page.evaluate(([lng, lat]) => {
      const map = (window as MapWindow).__mapForTest!;
      return new Promise<void>((resolve) => {
        map.once('idle', () => resolve());
        map.setCenter([lng, lat]);
        map.setZoom(16);
      });
    }, [POPUP_TARGET_LISTING.longitude!, POPUP_TARGET_LISTING.latitude!]);

    const point = await page.evaluate(([lng, lat]) => {
      const map = (window as MapWindow).__mapForTest!;
      return map.project([lng, lat]);
    }, [POPUP_TARGET_LISTING.longitude!, POPUP_TARGET_LISTING.latitude!]);

    await component.locator('.mapboxgl-canvas').click({ position: point });

    const popup = page.locator('.mapboxgl-popup');
    await expect(popup).toBeVisible({ timeout: 15000 });
    // Pins that the popup shows the clicked listing's own data, not just that
    // *a* popup with *some* content appeared.
    await expect(popup).toContainText(`€${POPUP_TARGET_LISTING.price!.toLocaleString('nl-BE')}`);
    const loveButton = popup.getByTestId('reaction-love-button');
    await expect(loveButton).toBeVisible();

    // Nothing recorded yet — proves the assertion below is really driven by
    // the click, not by some pre-existing state.
    await expect(component.getByTestId('last-toggle-call')).toHaveValue('');

    await loveButton.click();

    await expect(component.getByTestId('last-toggle-call')).toHaveValue(`${POPUP_TARGET_LISTING.id}:love`);
    await expect(component.getByTestId('my-reaction')).toHaveValue('love');
  });

  test('an open popup refreshes its reactor-names note when a reactor is renamed', async ({ page, mount }) => {
    await mockMapbox(page);

    // myUserId matches PARTICIPANT_FIXTURES[0]'s id, so the love click below
    // attributes the reaction to a *named* participant — the note this test
    // watches only renders names, not the un-named 'me' the other popup test
    // uses.
    const reactor = PARTICIPANT_FIXTURES[0];
    const component = await mount<typeof WithReactions>('components/Map/WithReactions', {
      myUserId: reactor.id,
      users: PARTICIPANT_FIXTURES,
    });
    await expect(component.locator('.mapboxgl-canvas')).toBeVisible({ timeout: 15000 });
    await waitForMapIdle(page);

    await page.evaluate(([lng, lat]) => {
      const map = (window as MapWindow).__mapForTest!;
      return new Promise<void>((resolve) => {
        map.once('idle', () => resolve());
        map.setCenter([lng, lat]);
        map.setZoom(16);
      });
    }, [POPUP_TARGET_LISTING.longitude!, POPUP_TARGET_LISTING.latitude!]);

    const point = await page.evaluate(([lng, lat]) => {
      const map = (window as MapWindow).__mapForTest!;
      return map.project([lng, lat]);
    }, [POPUP_TARGET_LISTING.longitude!, POPUP_TARGET_LISTING.latitude!]);

    await component.locator('.mapboxgl-canvas').click({ position: point });
    const popup = page.locator('.mapboxgl-popup');
    await expect(popup).toBeVisible({ timeout: 15000 });

    await popup.getByTestId('reaction-love-button').click();
    await expect(popup).toContainText(reactor.name);

    // update() re-renders the same mounted story with a renamed participant —
    // same id, new name — without closing the popup. The reactor-names note
    // should repaint to the new name while the popup stays open, not only
    // the next time it's reopened.
    const renamed = { ...reactor, name: 'Renamed' };
    await component.update({
      myUserId: reactor.id,
      users: [renamed, PARTICIPANT_FIXTURES[1]],
    });

    await expect(popup).toContainText('Renamed');
    await expect(popup).not.toContainText(reactor.name);
  });
});
