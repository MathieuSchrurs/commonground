import { describe, expect, it } from 'vitest';
import { slugifyCity } from './areas';

describe('slugifyCity', () => {
  it('lowercases and dashes municipality names', () => {
    expect(slugifyCity('Gent')).toBe('gent');
    expect(slugifyCity('Sint-Martens-Latem')).toBe('sint-martens-latem');
    expect(slugifyCity('De Pinte')).toBe('de-pinte');
  });

  it('strips diacritics and apostrophes', () => {
    expect(slugifyCity('Évregnies')).toBe('evregnies');
    expect(slugifyCity("Sint-Job-in-'t-Goor")).toBe('sint-job-in-t-goor');
  });

  it('handles empty input', () => {
    expect(slugifyCity('')).toBe('');
  });
});
