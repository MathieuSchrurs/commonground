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
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '.next/**', '.opencode/**', '.fallow/**'],
    // Everything under test today is pure logic — parsers, geo maths, folder
    // trees, the RLS ratchet. No DOM needed, and node is much faster to boot.
    environment: 'node',
    reporters: process.env.CI ? ['default', 'github-actions'] : ['default'],
  },
});
