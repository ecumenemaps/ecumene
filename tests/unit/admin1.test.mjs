// Unit tests for the built subdivision data (data/admin1, from scripts/build_admin1.js).
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { geoArea, geoContains } from 'd3-geo';
import { feature } from 'topojson-client';

const read = (f) => JSON.parse(readFileSync(new URL('../../data/admin1/' + f, import.meta.url)));
const index = read('index.json');
const units = (c) => read(index[c].f).objects.u.geometries;

test('every subdivision has a unique, stable code that saved maps can refer to', () => {
  const seen = new Map(),
    files = new Set();
  for (const c in index) {
    assert.ok(!files.has(index[c].f), 'file shared by two countries: ' + index[c].f);
    files.add(index[c].f);
    const g = units(c);
    assert.strictEqual(g.length, index[c].n, c);
    for (const u of g) {
      const code = u.properties.c;
      assert.match(code, /^[A-Z]{3}[0-9]{0,3}[-+][0-9?]{1,6}$/, c + ': ' + code);
      assert.ok(!seen.has(code), code + ' in both ' + seen.get(code) + ' and ' + c);
      seen.set(code, c);
    }
  }
  assert.ok(seen.size > 4500, 'units ' + seen.size);
});

test('overseas parts take their units from the parent, whose other units keep their ids', () => {
  const fr = units('France');
  assert.ok(!fr.some((u) => /Guyane|Guadeloupe|Martinique|Réunion|Mayotte/.test(u.properties.n)), 'no overseas departments in France');
  // ids are positions in Natural Earth's list, which saved exact outlines use; removing units leaves gaps
  assert.ok(Math.max(...fr.map((u) => u.id)) >= fr.length, 'ids keep their gaps');
  assert.deepStrictEqual(units('Caribbean Netherlands').map((u) => u.properties.n).sort(), ['Bonaire', 'Saba', 'Sint Eustatius']);
  assert.ok(!units('Netherlands').some((u) => /Saba|Eustatius|Bonaire/.test(u.properties.n)));
  for (const c of ['French Guiana', 'Réunion']) assert.ok(!index[c], c + ' is a single unit, painted whole');
});

test('every unit is wound for d3, so a click inside it finds it', () => {
  const wrong = [];
  for (const c in index)
    for (const f of feature(read(index[c].f), read(index[c].f).objects.u).features) {
      const g = f.geometry;
      for (const P of g.type === 'Polygon' ? [g.coordinates] : g.coordinates)
        if (geoArea({ type: 'Polygon', coordinates: P }) > 2 * Math.PI) wrong.push(c + ': ' + f.properties.n);
    }
  assert.deepStrictEqual(wrong, []);
});

test('areas no subdivision covers become a "Rest of" unit, without false ones across 180°', () => {
  const rest = (c) => feature(read(index[c].f), read(index[c].f).objects.u).features.find((f) => /^Rest of /.test(f.properties.n));
  // Natural Earth has no units for the north of Åland's main island (Finström, Geta, Hammarland, Saltvik, Sund)
  const al = rest('Åland');
  assert.strictEqual(al.properties.n, 'Rest of Åland');
  assert.strictEqual(al.properties.c, 'ALD+0');
  assert.ok(geoContains(al, [19.99, 60.23]), 'Finström');
  assert.ok(!geoContains(al, [19.94, 60.1]), 'not Mariehamn');
  // countries that straddle 180° must not get a false gap from planar clipping
  for (const c of ['Russia', 'Fiji', 'New Zealand']) assert.ok(!rest(c), c);
  // the enclaves the map merges into their surroundings are units of that country, listed after its own units so
  // their ids (which saved exact outlines use) stay put
  const kz = units('Kazakhstan'),
    cu = units('Cuba');
  assert.strictEqual(kz[kz.length - 1].properties.n, 'Baikonur');
  assert.strictEqual(cu[cu.length - 1].properties.n, 'USNB, Guantanamo Bay');
  assert.strictEqual(kz[12].properties.n, 'Akmola');
  assert.strictEqual(cu[0].properties.n, 'Guantánamo');
});

test('detail groups are offered only where they group several units', () => {
  const uk = index['United Kingdom'];
  assert.deepStrictEqual(Object.keys(uk.gr).sort(), ['g', 'r']);
  const parts = new Set(units('United Kingdom').map((u) => u.properties.g));
  assert.deepStrictEqual([...parts].sort(), ['England', 'Northern Ireland', 'Scotland', 'Wales']);
});
