import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Runs for every test file, including plain node-environment ones with no
// DOM at all — cleanup() no-ops when there's nothing rendered, so this is
// safe everywhere rather than needing to be repeated per component test.
afterEach(() => {
  cleanup();
});
