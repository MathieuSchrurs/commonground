import { describe, expect, it } from 'vitest';
import { parseCards, parsePrice } from './immovlan';

const card = `
  <article itemscope itemtype="http://schema.org/Place"
           data-url="https://immovlan.be/en/detail/house/for-sale/9000/gent/rbs12345">
    <span itemprop="postalCode">9000</span>
    <span itemprop="addressLocality">Gent</span>
    <div class="list-item-price">650 000 €</div>
    <div class="property-highlight"><strong>3</strong> bedrooms</div>
    <div class="property-highlight"><strong>150</strong> m²</div>
    <div class="media-pic"><img data-src="https://img.example.com/1.jpg" /></div>
  </article>`;

describe('parseCards', () => {
  it('parses a listing card', () => {
    const [listing] = parseCards(`<html><body>${card}</body></html>`);

    expect(listing).toMatchObject({
      source: 'immovlan',
      external_id: 'rbs12345',
      url: 'https://immovlan.be/en/detail/house/for-sale/9000/gent/rbs12345',
      city: 'Gent',
      postal_code: '9000',
      price: 650000,
      property_type: 'house',
      bedrooms: 3,
      surface_area: 150,
      image_url: 'https://img.example.com/1.jpg',
    });
  });

  it('skips multi-unit projects (no /detail/ in the URL)', () => {
    const html = `
      <article itemscope itemtype="http://schema.org/Place"
               data-url="https://immovlan.be/en/project/for-sale/9000/gent/proj1">
      </article>`;
    expect(parseCards(html)).toEqual([]);
  });
});

describe('parsePrice', () => {
  it('parses a simple price', () => {
    expect(parsePrice('650 000 €')).toBe(650000);
  });

  it('takes the first price of a range', () => {
    expect(parsePrice('225 000 € - 392 655 €')).toBe(225000);
  });

  it('returns undefined when there is no number', () => {
    expect(parsePrice('Price on request')).toBeUndefined();
  });
});
