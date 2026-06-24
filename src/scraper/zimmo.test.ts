import { describe, expect, it } from 'vitest';
import { extractProperties, parseListings } from './zimmo';

// Mirrors the real page: listings live in `properties: [ … ]` inside an inline
// app.start({ … }) call. Every numeric field is a string, objects carry nested
// arrays (firstImages) and objects (advertiser), and a `search` block with its
// own brackets sits *before* the array — all of which the bracket-depth scan
// must handle without stopping early.
const sample = `<!doctype html><html><body>
<script>
  $(function () {
    app.start({
      search: {"paging":{"from":0,"size":21},"filter":{"placeId":{"in":[1506]}}},
      properties: [
        {"particulier_pand_id":null,"code":"LPN9O","uuid":"742a8425","type":"Huis","status":"general.status.for_sale","hoofdFoto":"https://files.zimmo.be/x/828x618/filters:image-format(pjpg)/img.jpg","firstImages":["https://files.zimmo.be/a.jpg","https://files.zimmo.be/b.jpg"],"b_woonopp":"492","slaapkamers":"5","prijs":"2150000","zprijs":null,"address":"Jozef Plateaustraat 33","gemeente":"Gent","postcode":"9000","lat":"51.046350000","lon":"3.723970000","url":"/nl/gent-9000/te-koop/huis/LPN9O/","advertiser":{"name":"IRRES BVBA","phone":"+32"}},
        {"particulier_pand_id":null,"code":"LPNA3","type":"Appartement","prijs":"295000","address":"Plotersgracht 12","gemeente":"Gent","postcode":"9000","lat":"51.05","lon":"3.72","slaapkamers":"2","b_woonopp":"95","url":"/nl/gent-9000/te-koop/appartement/LPNA3/"}
      ],
      foo: 1
    });
  });
</script>
</body></html>`;

describe('extractProperties', () => {
  it('slices the array out past nested arrays/objects and a leading search block', () => {
    const props = extractProperties(sample);
    expect(props).toHaveLength(2);
    expect(props[0].code).toBe('LPN9O');
    expect(props[1].code).toBe('LPNA3');
  });

  it('returns [] when there is no app.start/properties block', () => {
    expect(extractProperties('<html><body><p>nothing here</p></body></html>')).toEqual([]);
  });
});

describe('parseListings', () => {
  it('maps Zimmo fields, coercing string numbers and using exact coords', () => {
    const [house, apt] = parseListings(sample);
    expect(house).toMatchObject({
      source: 'zimmo',
      external_id: 'LPN9O',
      url: 'https://www.zimmo.be/nl/gent-9000/te-koop/huis/LPN9O/',
      price: 2150000,
      address: 'Jozef Plateaustraat 33',
      city: 'Gent',
      postal_code: '9000',
      latitude: 51.04635,
      longitude: 3.72397,
      property_type: 'house',
      bedrooms: 5,
      surface_area: 492,
      image_url: 'https://files.zimmo.be/x/828x618/filters:image-format(pjpg)/img.jpg',
    });
    expect(apt).toMatchObject({ external_id: 'LPNA3', property_type: 'apartment', price: 295000 });
  });

  it('skips objects without a code', () => {
    const html = `<script>app.start({ properties: [{"prijs":"1","url":"/x"}] })</script>`;
    expect(parseListings(html)).toEqual([]);
  });
});
