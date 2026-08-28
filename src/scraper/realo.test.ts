import { describe, expect, it } from 'vitest';
import { parseCards, parsePrice } from './realo';

describe('parsePrice', () => {
  it('parses Belgian dot-separated thousands', () => {
    expect(parsePrice('€ 1.245.000')).toBe(1245000);
  });

  it('returns undefined without a euro sign', () => {
    expect(parsePrice('1.245.000')).toBeUndefined();
  });
});

describe('parseCards', () => {
  it('parses a grid item from its data attributes', () => {
    const html = `
      <div>before</div>
      <div data-scope="componentEstateGridItem" class="component-estate-grid-item house">
        <a data-href="/en/veldstraat-9000-gent/123456">Veldstraat</a>
        <span>€ 350.000</span>
        <span>3 bed</span>
        <span>120 m²</span>
        <div data-images="{srcAt2x&quot;:&quot;https:\\/\\/realocdn.com\\/image\\/5\\/abc.jpg\\/736x491&quot;}"></div>
      </div>`;

    const [listing] = parseCards(html);
    expect(listing).toMatchObject({
      source: 'realo',
      external_id: '123456',
      url: 'https://www.realo.be/en/veldstraat-9000-gent/123456',
      address: 'veldstraat, 9000 gent',
      city: 'gent',
      postal_code: '9000',
      price: 350000,
      bedrooms: 3,
      surface_area: 120,
      // entity-encoded, slash-escaped JSON must still yield a clean URL
      image_url: 'https://realocdn.com/image/5/abc.jpg/736x491',
    });
  });

  it('returns nothing when no grid items are present', () => {
    expect(parseCards('<html><body>empty</body></html>')).toEqual([]);
  });

  it('classifies an office listing as commercial', () => {
    const html = `
      <div>before</div>
      <div data-scope="componentEstateGridItem" class="component-estate-grid-item office">
        <a data-href="/en/kantoorstraat-9000-gent/654321">Kantoorstraat</a>
        <span>€ 480.000</span>
        <span>200 m²</span>
        <div data-images="{srcAt2x&quot;:&quot;https:\\/\\/realocdn.com\\/image\\/6\\/def.jpg\\/736x491&quot;}"></div>
      </div>`;

    const [listing] = parseCards(html);
    expect(listing.property_type).toBe('commercial');
  });
});
