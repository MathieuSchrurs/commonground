// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UserInputForm from './UserInputForm';
import { CommuteConstraint } from '@/types/user';

function mockGeocode() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ formattedAddress: 'Korenmarkt 1, Gent', latitude: 51.05, longitude: 3.72 }),
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UserInputForm — commercial-listing toggle', () => {
  it('defaults to hiding commercial listings for a new participant', () => {
    render(<UserInputForm onAddUser={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: /hide commercial listings/i });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  it('flips to showing commercial listings on click', async () => {
    const user = userEvent.setup();
    render(<UserInputForm onAddUser={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: /hide commercial listings/i });

    await user.click(toggle);

    expect(screen.getByRole('button', { name: /show commercial listings/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('submits the toggled preference, not just the default, when adding a new participant', async () => {
    mockGeocode();
    const user = userEvent.setup();
    const onAddUser = vi.fn();
    render(<UserInputForm onAddUser={onAddUser} />);

    await user.type(screen.getByLabelText(/name/i), 'Anna');
    await user.type(screen.getByLabelText(/work address/i), 'Korenmarkt 1, Gent');
    await user.click(screen.getByRole('button', { name: /hide commercial listings/i }));
    await user.click(screen.getByRole('button', { name: /add location/i }));

    expect(onAddUser).toHaveBeenCalledWith(expect.objectContaining({ hideCommercial: false }));
  });

  it('initializes from an existing participant being edited, including a false preference', () => {
    const userToEdit: CommuteConstraint = {
      id: 'u1',
      name: 'Anna',
      address: 'Korenmarkt 1, Gent',
      latitude: 51.05,
      longitude: 3.72,
      maxMinutes: 30,
      transportMode: 'driving',
      hideCommercial: false,
    };
    render(<UserInputForm onAddUser={vi.fn()} userToEdit={userToEdit} />);

    expect(screen.getByRole('button', { name: /show commercial listings/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('preserves an edited participant\'s true preference when updating', async () => {
    mockGeocode();
    const user = userEvent.setup();
    const onUpdateUser = vi.fn();
    const userToEdit: CommuteConstraint = {
      id: 'u1',
      name: 'Anna',
      address: 'Korenmarkt 1, Gent',
      latitude: 51.05,
      longitude: 3.72,
      maxMinutes: 30,
      transportMode: 'driving',
      hideCommercial: true,
    };
    render(<UserInputForm onAddUser={vi.fn()} onUpdateUser={onUpdateUser} userToEdit={userToEdit} />);

    await user.click(screen.getByRole('button', { name: /update location/i }));

    expect(onUpdateUser).toHaveBeenCalledWith(expect.objectContaining({ hideCommercial: true }));
  });
});
