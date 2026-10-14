// The source list (scripts/sources) and the subdivision layers built from it (scripts/build_layers.js). Every layer
// gets the same checks, so adding one is mostly adding its source file.
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { geoArea } from 'd3-geo';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const { loadSources, layers, readmeTable, README_START, README_END } = require('../../scripts/lib/sources.js');
const pc = require('polygon-clipping');
const world = require('../../src/overseas.js').splitOverseas(require('world-atlas/countries-10m.json'), feature);
const countries = feature(world, world.objects.countries).features.filter((f) => f.properties && f.properties.name);
const file = (p) => new URL('../../' + p, import.meta.url);
const index = JSON.parse(readFileSync(file('data/layers/index.json')));
const R2 = 6371 * 6371;
const polys = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
const km2 = (P) => {
  const a = geoArea({ type: 'Polygon', coordinates: P });
  return Math.min(a, 4 * Math.PI - a) * R2;
};
const MAX_KB = 1500;

test('every source has a named open licence, and the README table is generated from the list', () => {
  const all = loadSources(); // throws on an incomplete entry
  assert.ok(all.length >= 7);
  for (const e of all)
    assert.ok(!/non-?commercial/i.test(e.licence.name) && !/\bNC\b/.test(e.licence.name), e.id + ': licence must allow any use');
  const s = readFileSync(file('README.md'), 'utf8').replace(/\r\n/g, '\n'),
    a = s.indexOf(README_START),
    b = s.indexOf(README_END);
  assert.ok(a > 0 && b > a, 'README has the sources table markers');
  assert.strictEqual(
    s.slice(a + README_START.length, b).trim(),
    readmeTable(),
    'README table is out of date: run node scripts/fetch_sources.js --readme',
  );
});

for (const e of layers())
  test('layer ' + e.id + ': built, credited, inside its country and covering it', () => {
    const entry = (index[e.country] || []).find((x) => x.id === e.id);
    assert.ok(entry, 'in data/layers/index.json under ' + e.country);
    for (const k of ['name', 'unit', 'ed', 'f', 'title', 'credit', 'short', 'url']) assert.ok(entry[k], 'index entry has ' + k);
    assert.strictEqual(entry.credit, e.credit);
    const kb = statSync(file('data/layers/' + entry.f)).size / 1024;
    assert.ok(kb <= MAX_KB, entry.f + ' is ' + Math.round(kb) + ' KB, over ' + MAX_KB);
    const t = JSON.parse(readFileSync(file('data/layers/' + entry.f))),
      feats = feature(t, t.objects.u).features;
    assert.strictEqual(feats.length, entry.n);
    const codes = new Set();
    for (const f of feats) {
      const p = f.properties;
      assert.ok(p.n && p.c, 'unit ' + f.id + ' has a name and a code');
      assert.ok(/^[A-Za-z0-9_.+-]{1,32}$/.test(p.c), p.c + ': codes are saved in maps as layer:code');
      assert.ok(!codes.has(p.c), 'duplicate code ' + p.c);
      codes.add(p.c);
      for (const P of polys(f.geometry))
        assert.ok(geoArea({ type: 'Polygon', coordinates: P }) < 2 * Math.PI, p.n + ': a polygon is inside out');
    }
    // every unit inside the country (fitted at build time), and together covering nearly all of it
    const C = countries.filter((f) => f.properties.name === e.country).flatMap((f) => polys(f.geometry));
    const snap = (P) => P.map((r) => r.map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5]));
    let units = 0;
    for (const f of feats) {
      const U = polys(f.geometry).map(snap),
        area = U.reduce((s, P) => s + km2(P), 0),
        outside = pc.difference(U, ...C.map(snap)).reduce((s, P) => s + km2(P), 0);
      // the layer file's coordinates are rounded to about 1 m, which along a long fjord coast adds up to a little
      assert.ok(outside < 1 + 0.001 * area, f.properties.n + ': ' + outside.toFixed(1) + ' km² outside ' + e.country);
      units += area;
    }
    const country = C.reduce((s, P) => s + km2(P), 0);
    assert.ok(units / country > 0.95, 'units cover ' + ((100 * units) / country).toFixed(1) + '% of ' + e.country);
  });
