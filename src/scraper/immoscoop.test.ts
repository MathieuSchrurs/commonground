import { describe, expect, it } from 'vitest';
import { parseCards } from './immoscoop';

// Mirrors the live card structure: anchor with data-selector children
const card = `
  <a href="/te-koop/9000-gent/1146868" class="rounded-lg bg-white shadow-card">
    <div data-selector="property-card:media">
      <img data-selector="property-card:image" src="https://images.immoscoop.be/cp-abc123.jpg" alt="" />
    </div>
    <div data-selector="property-card:content">
      <h3 data-selector="property-card:title">Huis - Te koopGent</h3>
      <span data-selector="property-card:price">€ 499.000</span>
      <span data-selector="property-card:address">Sleepstraat 1379000 Gent</span>
    </div>
  </a>`;

describe('parseCards (immoscoop)', () => {
  it('parses a listing card', () => {
    const [listing] = parseCards(`<html><body>${card}</body></html>`);

    expect(listing).toMatchObject({
      source: 'immoscoop',
      external_id: '1146868',
      url: 'https://www.immoscoop.be/te-koop/9000-gent/1146868',
      title: 'Huis - Te koopGent',
      // street and postal+city are concatenated in the source markup
      address: 'Sleepstraat 137, 9000 Gent',
      city: 'Gent',
      postal_code: '9000',
      price: 499000,
      property_type: 'house',
      image_url: 'https://images.immoscoop.be/cp-abc123.jpg',
    });
  });

  it('maps Dutch apartment types', () => {
    const apt = card
      .replace('Huis - Te koopGent', 'Appartement - Te koopGent')
      .replace('/te-koop/9000-gent/1146868', '/te-koop/9000-gent/555');
    const [listing] = parseCards(apt);
    expect(listing.property_type).toBe('apartment');
  });

  it('ignores non-listing te-koop links (no numeric id)', () => {
    const html = '<a href="/te-koop/gent">all listings in Gent</a>';
    expect(parseCards(html)).toEqual([]);
  });

  it('falls back to URL parts when the address is missing', () => {
    const html = '<a href="/te-koop/9051-sint-denijs-westrem/777"><span data-selector="property-card:price">€ 250.000</span></a>';
    const [listing] = parseCards(html);
    expect(listing.postal_code).toBe('9051');
    expect(listing.city).toBe('sint denijs westrem');
  });
});
