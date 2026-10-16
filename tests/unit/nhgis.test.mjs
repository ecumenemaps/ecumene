// The census-year US states and territories built from IPUMS NHGIS's boundary files (1790 to 2020): each census's map is
// shown from 1 January of its year to the end of the year before the next census, the land not yet part of the US is
// "outside", and the layer carries NHGIS's full citation.
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { geoArea, geoBounds } from 'd3-geo';
import { feature } from 'topojson-client';
import { unitsAt } from '../../src/js/dated.js';

const file = (p) => JSON.parse(readFileSync(new URL('../../' + p, import.meta.url), 'utf8'));
const entry = file('data/layers/index.json')['United States of America'].find((x) => x.id === 'us-nhgis-states-2026');
const t = file('data/layers/' + entry.f),
  feats = feature(t, t.objects.u).features;
const names = (day) => unitsAt(feats, day).map((f) => f.properties.n);
const unit = (day, code) => unitsAt(feats, day).find((f) => f.properties.c === code);
const km2 = (f) => {
  const P = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  return P.reduce((s, Q) => s + geoArea({ type: 'Polygon', coordinates: Q }), 0) * 6371 * 6371;
};

test('the layer covers the censuses of 1790 to 2020 with its quick stops', () => {
  assert.deepStrictEqual([entry.dated.from, entry.dated.to], [17900101, 20201231]);
  assert.deepStrictEqual(entry.dated.stops, [17900101, 18200101, 18500101, 19000101, 19500101, 20000101, 20200101]);
});

test('it credits NHGIS with the full citation it asks for, and says it is simplified and census-year only', () => {
  assert.ok(entry.credit.includes('Jonathan Schroeder, David Van Riper, Steven Manson, Grace Cooper, Zachary Krause, Tracy Kugler, Tsu Zhu, and Steven Ruggles.'));
  assert.ok(entry.credit.includes('IPUMS National Historical Geographic Information System: Version 21.0 [dataset]. Minneapolis, MN: IPUMS. 2026. http://doi.org/10.18128/D050.V21.0'));
  assert.ok(/simplified/.test(entry.credit) && /simplified/.test(entry.short));
  assert.ok(/changes between censuses/.test(entry.note) && /simplified copies/.test(entry.note));
});

test('units on each stop: the census map, plus the land not yet part of the US', () => {
  const counts = Object.fromEntries(entry.dated.stops.map((d) => [d, unitsAt(feats, d).length]));
  assert.deepStrictEqual(counts, { 17900101: 17, 18200101: 28, 18500101: 38, 19000101: 52, 19500101: 51, 20000101: 51, 20200101: 51 });
});

test('a census map is shown until the end of the year before the next census', () => {
  assert.deepStrictEqual(names(17991231).sort(), names(17900101).sort());
  assert.ok(!names(17991231).includes('Kentucky'), 'Kentucky, a state since 1792, first appears with the 1800 census');
  assert.ok(names(18000101).includes('Kentucky'));
  assert.ok(unit(17991231, 'northwest-territory') && unit(18000101, 'northwest-territory'), 'in both the 1790 and the 1800 map');
  assert.ok(unit(18500101, 'texas') && unit(18591231, 'texas') && unit(18600101, 'texas'));
});

test('each unit says which census its borders are from', () => {
  assert.strictEqual(unit(18500101, 'texas').properties.x, 'Borders as at the 1850 census, shown for 1850 to 1859; changes between censuses are not shown.');
  assert.match(unit(20200101, 'texas').properties.x, /shown for the year 2020/);
});

test('territories and states are told apart; Puerto Rico is left out', () => {
  assert.strictEqual(unit(18700101, 'dakota-territory').properties.ty, 'Territory');
  assert.strictEqual(unit(18700101, 'texas').properties.ty, 'State');
  assert.strictEqual(unit(19500101, 'district-of-columbia').properties.ty, 'Federal district');
  assert.ok(!feats.some((f) => /puerto-rico/.test(f.properties.c)), 'the map draws Puerto Rico as its own country');
});

test('Alaska is outside the US in 1870, Hawaii in 1890, and nothing is from 1900', () => {
  const alaska = unit(18700101, 'outside');
  assert.ok(geoBounds(alaska)[1][1] > 70, 'Alaska reaches past 70°N');
  assert.ok(Math.abs(km2(alaska) - 1480000) < 120000, Math.round(km2(alaska)) + ' km²');
  const hawaii = unit(18900101, 'outside'),
    b = geoBounds(hawaii);
  assert.ok(b[0][0] < -154 && b[1][0] > -161 && b[0][1] > 18 && b[1][1] < 23, 'within the Hawaiian Islands');
  assert.ok(Math.abs(km2(hawaii) - 16600) < 2500, Math.round(km2(hawaii)) + ' km²');
  for (const d of [19000101, 19500101, 20000101, 20100101, 20200101]) assert.ok(!unit(d, 'outside'), d + ' has nothing outside');
});

test('the 2020 map covers the country: the units add up to about the land the map has', () => {
  const total = unitsAt(feats, 20200101).reduce((s, f) => s + km2(f), 0);
  assert.ok(total > 8.5e6 && total < 9.5e6, Math.round(total) + ' km² in all');
});
