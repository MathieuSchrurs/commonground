import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { GALLERY_PORT } from './gallery-server';

// Standalone Vite server for the component-testing gallery only — this app
// is Next.js, which has no dev server suitable for serving a bare gallery
// page, so the gallery gets its own minimal one. Not part of the app build.
// PostCSS (and Tailwind v4 through it) is picked up automatically from the
// project root's postcss.config.mjs — no separate Tailwind plugin needed.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../src', import.meta.url)),
    },
  },
  server: {
    port: GALLERY_PORT,
  },
  define: {
    // Map.tsx reads this directly via process.env at render time; Vite has no
    // Node process global in the browser bundle, so it must be replaced at
    // build time. The gallery's Mapbox network calls are mocked in tests, so
    // this only needs to be a non-empty string, not a real token.
    'process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN': JSON.stringify('gallery-test-token'),
  },
});
