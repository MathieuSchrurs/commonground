import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MAPBOX_CSS_RE = /mapbox-gl\/dist\/mapbox-gl\.css/;

describe('mapbox-gl stylesheet import location', () => {
  it('is not imported globally in globals.css', () => {
    const globalsCss = fs.readFileSync(
      path.join(__dirname, '..', 'app', 'globals.css'),
      'utf-8'
    );

    expect(globalsCss).not.toMatch(MAPBOX_CSS_RE);
  });

  it('is imported alongside Map.tsx, where the map actually renders', () => {
    const mapTsx = fs.readFileSync(path.join(__dirname, 'Map.tsx'), 'utf-8');

    expect(mapTsx).toMatch(MAPBOX_CSS_RE);
  });
});
