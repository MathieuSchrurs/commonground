import { defineConfig, devices } from '@playwright/test';
import { GALLERY_URL } from './playwright/gallery-server';

// Component tests only today (see .claude/skills/playwright-component-testing).
// Stories live beside their component as src/**/*.story.tsx; specs beside
// the component too, as src/**/*.spec.ts. The gallery that hosts them is a
// small standalone Vite server (this app is Next.js, which has no dev
// server suitable for serving a bare gallery page) — see playwright/.
export default defineConfig({
  testDir: './src',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  reporter: 'list',
  projects: [
    {
      name: 'components',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: GALLERY_URL,
        serviceWorkers: 'block',
        reuseContext: true,
      },
    },
  ],
  webServer: {
    command: 'npx vite --config playwright/vite.config.mts',
    url: GALLERY_URL,
    reuseExistingServer: !process.env.CI,
  },
});
