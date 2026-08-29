import { test, expect } from '@playwright/test';
import { LISTING_COUNT, ISOCHRONE_FIXTURES, INTERSECTION_FIXTURE, USER_FIXTURES, type Default, type WithZones, type WithUsers } from './Map.story';

// Minimal shape of the window globals WithZones records — avoids pulling the
// mapbox-gl types into code that runs inside page.evaluate.
type GeoJSONSourceLike = { setData: (data: unknown) => void };
type MapWindow = typeof globalThis & {
  __mapForTest?: { getSource: (id: string) => GeoJSONSourceLike | undefined };
  __isoSourceBefore?: unknown;
  __intersectionSourceBefore?: unknown;
  __intersectionSetDataCalls?: number;
};

// mapbox-gl is real here (not mocked like the jsdom Map.test.tsx) — the
// whole point of a browser-based test is to exercise its actual clustering
// engine, not a fake Marker/Popup pair. Only the network is mocked, so this
// costs no real Mapbox API usage: a minimal valid style (no sources/layers)
// is enough for the library to fire 'load'; everything Map.tsx itself adds
// on top (markers, isochrone layers) uses inline GeoJSON data, not a URL, so
// nothing else needs mocking for the map to become interactive.
async function mockMapbox(page: import('@playwright/test').Page) {
  await page.route('**/api.mapbox.com/styles/v1/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ version: 8, sources: {}, layers: [], glyphs: undefined, sprite: undefined }),
    })
  );
  // Telemetry/analytics — not needed for the map to function, just quieted.
  await page.route('**/events.mapbox.com/**', (route) => route.fulfill({ status: 204, body: '' }));
}

test.describe('Map story gallery', () => {
  test('mounts and reaches an idle, loaded state with markers on the map', async ({ page, mount }) => {
    await mockMapbox(page);

    const component = await mount<typeof Default>('components/Map/Default');

    // The map container itself is the outer div Map.tsx renders around the
    // mapboxgl.Map instance's container ref.
    await expect(component.locator('.mapboxgl-canvas')).toBeVisible({ timeout: 15000 });

    // Every listing gets a real marker DOM node today — this assertion is
    // exactly what #38 should change (to a bounded number regardless of
    // listing count) once markers become a clustered GeoJSON layer instead.
    const markers = component.locator('.mapboxgl-marker');
    await expect(markers).toHaveCount(LISTING_COUNT, { timeout: 15000 });
  });

  test('an unrelated prop change does not tear down and recreate the markers', async ({ page, mount }) => {
    await mockMapbox(page);

    const component = await mount<typeof Default>('components/Map/Default', { myUserId: 'me' });
    await expect(component.locator('.mapboxgl-marker')).toHaveCount(LISTING_COUNT, { timeout: 15000 });

    // Tag the live marker nodes so the check below is "these exact nodes
    // survived", not just "the count still matches" — a naive tear-down and
    // recreate would still land on the same count with a fresh set of nodes.
    const idsBefore = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('.mapboxgl-marker'));
      nodes.forEach((el, i) => el.setAttribute('data-test-marker-id', String(i)));
      return nodes.map((_, i) => String(i));
    });

    // myUserId is not in Map.tsx's marker-creation effect's dependency list —
    // who's viewing has nothing to do with which listings exist. update()
    // re-renders the same mounted story in place (no navigation, no
    // remount), so this exercises exactly the prop-change path Map.tsx sees
    // in the real app when a participant is selected/deselected.
    await component.update({ myUserId: 'someone-else' });

    await expect(component.locator('.mapboxgl-marker')).toHaveCount(LISTING_COUNT, { timeout: 15000 });
    const idsAfter = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.mapboxgl-marker')).map((el) => el.getAttribute('data-test-marker-id'))
    );

    expect(idsAfter.sort()).toEqual(idsBefore.sort());
  });

  test('an unrelated re-render does not tear down and recreate the isochrone/intersection layers', async ({ page, mount }) => {
    await mockMapbox(page);

    const component = await mount<typeof WithZones>('components/Map/WithZones', {
      isochrones: ISOCHRONE_FIXTURES,
      intersection: INTERSECTION_FIXTURE,
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
    // isochrones/intersection object references with unchanged content —
    // exactly what an unrelated re-render produces in the real app (e.g.
    // renaming a participant). Map.tsx should leave the layers alone.
    await component.update({ isochrones: ISOCHRONE_FIXTURES, intersection: INTERSECTION_FIXTURE });

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

    const component = await mount<typeof WithUsers>('components/Map/WithUsers', { users: USER_FIXTURES });
    await expect(component.locator('.user-marker')).toHaveCount(USER_FIXTURES.length, { timeout: 15000 });

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
    await component.update({ users: USER_FIXTURES });

    await expect(component.locator('.user-marker')).toHaveCount(USER_FIXTURES.length, { timeout: 15000 });
    const idsAfter = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.user-marker')).map((el) => el.getAttribute('data-test-marker-id'))
    );

    expect(idsAfter.sort()).toEqual(idsBefore.sort());
  });
});
