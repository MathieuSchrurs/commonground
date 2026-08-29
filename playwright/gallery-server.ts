// Single source for the gallery server's port/URL — playwright/vite.config.mts
// (which starts it) and playwright.config.ts (which points Playwright's
// baseURL/webServer.url at it) both import this instead of repeating the
// literal in three places.
export const GALLERY_PORT = 3100;
export const GALLERY_URL = `http://localhost:${GALLERY_PORT}/playwright/gallery/index.html`;
