// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  usePathname: () => '/session/abc12345',
}));

// ShareLink does its own (unrelated) fetch for the invite token — stub it out
// so this test can assert on SessionHeader's own network behaviour alone.
vi.mock('@/components/ShareLink', () => ({ default: () => null }));

import SessionHeader from './SessionHeader';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SessionHeader', () => {
  it('renders the name it is given, without fetching anything itself', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    render(<SessionHeader sessionId="abc12345" name="My Hunt" />);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByText('My Hunt')).toBeInTheDocument();
  });

  it('falls back to the short session id when no name is available', () => {
    render(<SessionHeader sessionId="abc12345" name={null} />);

    expect(screen.getByText('abc12345'.slice(0, 8))).toBeInTheDocument();
  });
});
