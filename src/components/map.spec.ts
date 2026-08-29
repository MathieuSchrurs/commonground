import { test, expect } from '@playwright/test';
import { LISTING_COUNT, type Default } from './Map.story';

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
});
