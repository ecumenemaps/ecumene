// Dated layers (src/js/dated.js) and the historical US states and territories built from the Atlas of Historical
// County Boundaries (#46): known days of the history come out as the Atlas records them.
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { geoArea, geoBounds } from 'd3-geo';
import { feature } from 'topojson-client';
import { onDate, unitsAt, validDay, fmtDay, fmtSpan, parseDay, isoDay, yearDay } from '../../src/js/dated.js';

const file = (p) => JSON.parse(readFileSync(new URL('../../' + p, import.meta.url), 'utf8'));
const entry = file('data/layers/index.json')['United States of America'].find((x) => x.id === 'us-ahcb-states-2011');
const t = file('data/layers/' + entry.f),
  feats = feature(t, t.objects.u).features;
const names = (day) => unitsAt(feats, day).map((f) => f.properties.n);
const unit = (day, code) => unitsAt(feats, day).find((f) => f.properties.c === code);
const km2 = (f) => {
  const P = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  return P.reduce((s, Q) => s + geoArea({ type: 'Polygon', coordinates: Q }), 0) * 6371 * 6371;
};

test('onDate includes both the first and the last day', () => {
  const p = { d0: 18210810, d1: 20001231 };
  assert.ok(onDate(p, 18210810) && onDate(p, 20001231));
  assert.ok(!onDate(p, 18210809) && !onDate(p, 20010101));
});

test('days: checked, written out, read from a date input, a year kept within the layer', () => {
  assert.ok(validDay(18500101) && validDay(18960229) && !validDay(19000229) && !validDay(18501301) && !validDay(1850.5));
  assert.strictEqual(fmtDay(18500101), '1 January 1850');
  assert.strictEqual(fmtDay(18121207, true), '7 Dec 1812');
  assert.strictEqual(fmtSpan({ d0: 18121207, d1: 18210809 }, 20001231), '7 Dec 1812 – 9 Aug 1821');
  assert.strictEqual(fmtSpan({ d0: 19590103, d1: 20001231 }, 20001231), 'from 3 Jan 1959');
  assert.strictEqual(parseDay('1861-04-12'), 18610412);
  assert.strictEqual(parseDay('1861-02-30'), null);
  assert.strictEqual(parseDay(''), null);
  assert.strictEqual(isoDay(17830903), '1783-09-03');
  assert.strictEqual(yearDay(1783, 17830903, 20001231), 17830903, 'the layer starts in September 1783');
  assert.strictEqual(yearDay(1850, 17830903, 20001231), 18500101);
});

test('the layer covers 3 September 1783 to 31 December 2000 with the quick stops', () => {
  assert.deepStrictEqual([entry.dated.from, entry.dated.to], [17830903, 20001231]);
  assert.deepStrictEqual(entry.dated.stops, [17900101, 18200101, 18500101, 18610101, 18900101]);
});

// the Atlas's units in force on each day, plus its disputed overlaps and "Outside the United States"
test('units on each stop: the Atlas, its disputes and the land not yet part of the US', () => {
  const counts = Object.fromEntries(entry.dated.stops.map((d) => [d, unitsAt(feats, d).length]));
  assert.deepStrictEqual(counts, { 17900101: 18, 18200101: 31, 18500101: 38, 18610101: 43, 18900101: 53 });
  assert.strictEqual(unitsAt(feats, 20001231).length, 51, '50 states, DC and nothing outside');
  assert.ok(!unit(20001231, 'outside'));
});

test('Missouri becomes a state on 10 August 1821', () => {
  assert.ok(unit(18210809, 'mo_terr') && !unit(18210809, 'mo_state'));
  assert.ok(unit(18210810, 'mo_state') && !unit(18210810, 'mo_terr'));
});

test('disputed areas are their own units, named for both claimants', () => {
  assert.ok(names(18900101).includes('Indian Territory / Texas (disputed)'), 'Greer County');
  assert.ok(names(18200101).includes('Alabama / Mississippi (disputed)'));
  assert.ok(!names(18970101).some((n) => n.includes('disputed')), 'Greer County settled in 1896');
});

test("Deseret is left out; claims beyond today's border are kept", () => {
  assert.ok(!feats.some((f) => /deseret/i.test(f.properties.c)));
  const oregon = unit(18200101, 'or_country');
  assert.ok(geoBounds(oregon)[1][1] > 54.5, 'Oregon Country reaches 54°40′N');
});

test('in 1890 the only land outside the US is Hawaii, annexed in 1898', () => {
  const out = unit(18900101, 'outside'),
    b = geoBounds(out);
  assert.ok(b[0][0] < -154 && b[1][0] > -161 && b[0][1] > 18 && b[1][1] < 23, 'within the Hawaiian Islands');
  assert.ok(Math.abs(km2(out) - 16600) < 1500, Math.round(km2(out)) + ' km²');
});
