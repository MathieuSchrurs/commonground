import { describe, expect, it } from 'vitest';
import { extractFromHtml, extractFromScripts } from './zimmo';

describe('extractFromScripts', () => {
  it('finds listings inside window.__INITIAL_STATE__', () => {
    const state = {
      search: {
        properties: [{
          id: 111,
          url: '/property/111',
          price: { amount: 250000 },
          location: { city: 'Gent', postalCode: '9000', street: 'Veldstraat' },
          type: 'house',
          bedrooms: 2,
          livingArea: 95,
        }],
      },
    };
    const html = `<html><body><script>window.__INITIAL_STATE__ = ${JSON.stringify(state)};</script></body></html>`;

    const listings = extractFromScripts(html);
    expect(listings).not.toBeNull();
    expect(listings![0]).toMatchObject({
      source: 'zimmo',
      external_id: '111',
      url: 'https://www.zimmo.be/property/111',
      price: 250000,
      city: 'Gent',
      postal_code: '9000',
      property_type: 'house',
      bedrooms: 2,
      surface_area: 95,
    });
  });

  it('returns null when no state object is present', () => {
    expect(extractFromScripts('<html><body><p>nothing here</p></body></html>')).toBeNull();
  });
});

describe('extractFromHtml', () => {
  it('parses JSON-LD residence entries', () => {
    const jsonLd = [{
      '@type': 'Residence',
      '@id': 'property/123456',
      url: 'https://www.zimmo.be/property/123456',
      name: 'Family home',
      address: { addressLocality: 'Gent', postalCode: '9000' },
      offers: { price: 295000 },
      geo: { latitude: 51.05, longitude: 3.72 },
    }];
    const html = `<html><body><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></body></html>`;

    const [listing] = extractFromHtml(html);
    expect(listing).toMatchObject({
      source: 'zimmo',
      external_id: '123456',
      url: 'https://www.zimmo.be/property/123456',
      title: 'Family home',
      city: 'Gent',
      postal_code: '9000',
      price: 295000,
      latitude: 51.05,
      longitude: 3.72,
    });
  });

  it('falls back to parsing listing cards', () => {
    const html = `
      <html><body>
        <article>
          <a href="/en/property/9876/">Listing</a>
          <div class="price">€ 350.000</div>
          <div class="location">9000 Gent</div>
          <img src="https://img.example.com/1.jpg" />
        </article>
      </body></html>`;

    const [listing] = extractFromHtml(html);
    expect(listing).toMatchObject({
      source: 'zimmo',
      external_id: '9876',
      url: 'https://www.zimmo.be/en/property/9876/',
      city: 'Gent',
      postal_code: '9000',
      price: 350000,
      image_url: 'https://img.example.com/1.jpg',
    });
  });
});
