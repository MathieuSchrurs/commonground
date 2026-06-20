import { describe, expect, it } from 'vitest';
import { resolveToggle } from './reactions';

describe('resolveToggle', () => {
  it('adds a reaction when the participant has none yet', () => {
    expect(resolveToggle(null, 'love')).toEqual({ action: 'upsert', reaction: 'love' });
    expect(resolveToggle(null, 'veto')).toEqual({ action: 'upsert', reaction: 'veto' });
  });

  it('removes the reaction when the same one is applied again', () => {
    expect(resolveToggle('love', 'love')).toEqual({ action: 'remove' });
    expect(resolveToggle('veto', 'veto')).toEqual({ action: 'remove' });
  });

  it('replaces the reaction when a different one is applied', () => {
    expect(resolveToggle('love', 'veto')).toEqual({ action: 'upsert', reaction: 'veto' });
    expect(resolveToggle('veto', 'love')).toEqual({ action: 'upsert', reaction: 'love' });
  });
});
