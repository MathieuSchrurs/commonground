import { describe, expect, it } from 'vitest';
import { extractListings } from './immoweb';

const payload = JSON.stringify({
  id: 12345,
  property: {
    type: 'HOUSE',
    title: 'Charming family home',
    bedroomCount: 3,
    netHabitableSurface: 150,
    landSurface: 400,
    location: {
      street: 'Veldstraat',
      number: '12',
      locality: 'Gent',
      postalCode: 9000,
      latitude: 51.05,
      longitude: 3.72,
    },
  },
  price: { mainValue: 350000 },
  media: { pictures: [{ mediumUrl: 'https://img.example.com/1.jpg' }] },
});

const card = `
  <article id="classified_12345">
    <a class="card__title-link" href="/en/classified/house/for-sale/gent/9000/12345">Charming family home</a>
    <iw-classified-item-bookmark :classified='${payload}'></iw-classified-item-bookmark>
  </article>`;

describe('extractListings', () => {
  it('parses a full listing from the embedded Vue payload', () => {
    const [listing] = extractListings(`<html><body>${card}</body></html>`);

    expect(listing).toMatchObject({
      source: 'immoweb',
      external_id: '12345',
      url: 'https://www.immoweb.be/en/classified/house/for-sale/gent/9000/12345',
      title: 'Charming family home',
      address: 'Veldstraat 12, 9000 Gent',
      city: 'Gent',
      postal_code: '9000',
      latitude: 51.05,
      longitude: 3.72,
      price: 350000,
      property_type: 'house',
      bedrooms: 3,
      surface_area: 150,
      land_area: 400,
      image_url: 'https://img.example.com/1.jpg',
    });
  });

  it('falls back to a URL-only stub when the payload is missing', () => {
    const html = '<article id="classified_99"></article>';
    const [listing] = extractListings(html);

    expect(listing).toMatchObject({
      source: 'immoweb',
      external_id: '99',
      url: 'https://www.immoweb.be/en/classified/99',
    });
    expect(listing.price).toBeUndefined();
  });

  it('returns nothing for pages without listing cards', () => {
    expect(extractListings('<html><body><p>blocked</p></body></html>')).toEqual([]);
  });
});
