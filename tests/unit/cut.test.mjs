// Cutting lakes out of countries and subdivisions, the same cut SVG export runs (scripts/lib/cut.js). The data is
// fixed between releases, so cutting every country and every subdivision file at every Lakes setting here means a
// shape the clipper cannot handle is found by this test rather than met at export time.
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { geoArea, geoContains } from 'd3-geo';
import { feature } from 'topojson-client';
import { inflate, decodePhys } from '../../src/js/decode.js';
import { lakePolygons, prepareLakes, cutLakes } from '../../scripts/lib/cut.js';

const require = createRequire(import.meta.url);
const pc = require('polygon-clipping');
const world = require('../../src/overseas.js').splitOverseas(require('world-atlas/countries-10m.json'), feature);
const countries = feature(world, world.objects.countries).features.filter((f) => f.properties && f.properties.name);
const p = decodePhys(await inflate(readFileSync(new URL('../../data/phys.bin', import.meta.url))));
const R2 = 6371 * 6371;
// area of each piece on its small side: a few tiny islands in the 10m data wind the wrong way (see countryFeats in export.js)
const km2 = (g) =>
  (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).reduce((s, P) => {
    const a = geoArea({ type: 'Polygon', coordinates: P });
    return s + Math.min(a, 4 * Math.PI - a) * R2;
  }, 0);
// the lakes each Lakes setting shows: the always-water ones always, then the major ones, then all
const SETS = {
  none: prepareLakes(lakePolygons(p, p.lakeSea.rings)),
  major: prepareLakes(lakePolygons(p, p.lakeMajor.rings)),
  all: prepareLakes(lakePolygons(p, p.lakeLines.lens.length)),
};
const byName = (n) => countries.find((f) => f.properties.name === n);

/** Cut one geometry and check the result: no failures, no polygon turned inside out, never larger than before. */
function check(g, lakes, what) {
  const r = cutLakes(g, lakes, pc);
  assert.strictEqual(r.failed, 0, what + ': ' + r.failed + ' piece(s) could not be cut');
  if (r.cut) {
    for (const P of r.geometry.coordinates)
      assert.ok(geoArea({ type: 'Polygon', coordinates: P }) < 2 * Math.PI, what + ': a piece is inside out');
    assert.ok(km2(r.geometry) <= km2(g) * 1.0001 + 1, what + ': larger after the cut');
  }
  return r;
}

test('lake polygons come back with their islands', () => {
  assert.ok(p.lakePolys, 'phys.bin has the rings-per-polygon list');
  const all = lakePolygons(p, p.lakeLines.lens.length);
  assert.strictEqual(
    all.reduce((s, P) => s + P.length, 0),
    p.lakeLines.lens.length,
  );
  assert.ok(
    all.some((P) => P.length > 1),
    'some lakes have islands',
  );
  // the prefixes end on whole polygons
  assert.strictEqual(
    lakePolygons(p, p.lakeSea.rings).reduce((s, P) => s + P.length, 0),
    p.lakeSea.rings,
  );
  assert.strictEqual(
    lakePolygons(p, p.lakeMajor.rings).reduce((s, P) => s + P.length, 0),
    p.lakeMajor.rings,
  );
});

test('known places after the cut', () => {
  const cut = (n, set) => check(byName(n).geometry, SETS[set], n).geometry;
  const nl = cut('Netherlands', 'none');
  assert.ok(!geoContains(nl, [5.35, 52.75]) && !geoContains(nl, [5.25, 52.5]), 'IJsselmeer and Markermeer are not Dutch land');
  assert.ok(geoContains(nl, [5.6, 52.5]), 'Flevoland is');
  const lost = km2(byName('Netherlands').geometry) - km2(nl);
  assert.ok(lost > 1500 && lost < 2500, 'the Netherlands loses about the IJsselmeer: ' + Math.round(lost) + ' km²');
  const ug = cut('Uganda', 'major');
  assert.ok(!geoContains(ug, [33, -0.5]), 'Lake Victoria is not Ugandan land');
  assert.ok(geoContains(ug, [32.6, 0.3]), 'Kampala is');
  const ca = cut('Canada', 'major');
  assert.ok(geoContains(ca, [-82.0, 45.8]), 'Manitoulin Island, in Lake Huron, stays Canadian land');
  assert.ok(!geoContains(ca, [-80.6, 45.3]), 'Georgian Bay is water');
  assert.ok(!geoContains(ca, [-82.3, 44.6]), 'Lake Huron is water');
  // no cut at all where no lake is shown
  assert.strictEqual(cutLakes(byName('Uganda').geometry, SETS.none, pc).cut, 0);
});

test('every country cuts cleanly at every Lakes setting', () => {
  for (const [k, lakes] of Object.entries(SETS)) for (const f of countries) check(f.geometry, lakes, f.properties.name + ' (' + k + ')');
});

test('every subdivision cuts cleanly at every Lakes setting', () => {
  const dir = new URL('../../data/admin1/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f !== 'index.json')) {
    const t = JSON.parse(readFileSync(new URL(file, dir)));
    for (const f of feature(t, t.objects.u).features)
      for (const [k, lakes] of Object.entries(SETS)) check(f.geometry, lakes, file + ' ' + f.properties.n + ' (' + k + ')');
  }
});
