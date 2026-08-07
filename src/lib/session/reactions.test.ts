import { describe, expect, it } from 'vitest';
import { resolveToggle } from './reactions';

describe('resolveToggle', () => {
  it('adds a reaction when the participant has none yet', () => {
    expect(resolveToggle(null, 'love')).toEqual({ action: 'upsert', reaction: 'love' });
    expect(resolveToggle(null, 'object')).toEqual({ action: 'upsert', reaction: 'object' });
  });

  it('removes the reaction when the same one is applied again', () => {
    expect(resolveToggle('love', 'love')).toEqual({ action: 'remove' });
    expect(resolveToggle('object', 'object')).toEqual({ action: 'remove' });
  });

  it('replaces the reaction when a different one is applied', () => {
    expect(resolveToggle('love', 'object')).toEqual({ action: 'upsert', reaction: 'object' });
    expect(resolveToggle('object', 'love')).toEqual({ action: 'upsert', reaction: 'love' });
  });
});
