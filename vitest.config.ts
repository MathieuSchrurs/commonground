import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Vitest does not read `paths` out of tsconfig.json, so the `@/` alias the tests
// use (`@/types/files`, `@/scraper/types`) has to be restated here. Without it
// those imports resolve to nothing and the suite fails before it runs.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // Only our own tests. `.opencode/` and `.fallow/` carry their own vendored
    // node_modules with thousands of upstream test files in them.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '.next/**', '.opencode/**', '.fallow/**'],
    // Pure logic (parsers, geo maths, folder trees, the RLS ratchet) stays on
    // node — no DOM needed there, and node is much faster to boot. Component
    // tests (.test.tsx) opt into jsdom individually via a leading
    // `// @vitest-environment jsdom` comment in the file, rather than paying
    // jsdom's boot cost for every test in the suite.
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    reporters: process.env.CI ? ['default', 'github-actions'] : ['default'],
  },
});
