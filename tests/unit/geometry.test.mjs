// Unit tests for the pure modules: data decoding and spherical geometry.
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { geoContains, geoArea } from 'd3-geo';
import { inflate, decodeTris, decodePhys } from '../../src/js/decode.js';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
import { ringPolygon, labelAnchor, smoothPath, arrowLine, largestRing, smallUnits } from '../../src/js/shapes.js';
import { ALIAS, NO_MARKER } from '../../src/js/data.js';

const bin = (p) => inflate(readFileSync(new URL('../../' + p, import.meta.url)));

test('fill mesh decodes to valid triangles', async () => {
  const t = decodeTris(await bin('data/tris.bin'));
  const nv = t.ids.length;
  assert.ok(nv > 500000, 'vertex count ' + nv);
  assert.strictEqual(t.ll.length, 2 * nv);
  assert.strictEqual(t.idx.length % 3, 0);
  let max = 0;
  for (const i of t.idx) if (i > max) max = i;
  assert.ok(max < nv, 'indices in range');
  for (let i = 0; i < nv; i += 997) {
    assert.ok(Math.abs(t.ll[2 * i + 1]) <= 90.0001, 'latitude in range');
    assert.ok(t.ids[i] > 0 && t.ids[i] < 256, 'country id in range');
  }
});

test('lakes and rivers decode with consistent counts', async () => {
  const p = decodePhys(await bin('data/phys.bin'));
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  assert.strictEqual(p.lakeIdx.length % 3, 0);
  assert.strictEqual(sum(p.lakeLines.lens) * 2, p.lakeLines.pts.length);
  assert.strictEqual(sum(p.rivers.lens) * 2, p.rivers.pts.length);
  const [t0, t1, t2] = p.rivers.tiers;
  assert.strictEqual(t0[0], 0);
  assert.strictEqual(t0[1], t1[0]);
  assert.strictEqual(t1[1], t2[0]);
  assert.strictEqual(t2[1], p.rivers.lens.length);
  // Major lakes are a non-empty prefix of the lake triangles and outlines.
  assert.ok(p.lakeMajor.idx > 0 && p.lakeMajor.idx < p.lakeIdx.length);
  assert.strictEqual(p.lakeMajor.idx % 3, 0);
  assert.ok(p.lakeMajor.rings > 0 && p.lakeMajor.rings < p.lakeLines.lens.length);
});

const square = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];
test('ringPolygon covers the small side whatever the winding', () => {
  for (const ring of [square, square.slice().reverse()]) {
    const g = ringPolygon(ring);
    assert.ok(geoArea(g) < 0.1, 'area ' + geoArea(g));
    assert.ok(geoContains(g, [5, 5]));
    assert.ok(!geoContains(g, [100, 40]));
  }
});

test('labelAnchor lands inside an L shape, not in its notch', () => {
  const L = [
    [0, 0],
    [12, 0],
    [12, 4],
    [4, 4],
    [4, 12],
    [0, 12],
  ];
  const a = labelAnchor(L);
  assert.ok(geoContains(ringPolygon(L), a), 'anchor ' + a);
  assert.ok(!(a[0] > 4.5 && a[1] > 4.5), 'not in the notch');
});

test('smoothPath passes through its end points and stays on the sphere', () => {
  const pts = [
    [0, 0],
    [20, 10],
    [40, 0],
    [60, 15],
  ];
  const s = smoothPath(pts);
  assert.deepStrictEqual(s[0], pts[0]);
  assert.deepStrictEqual(s[s.length - 1], pts[pts.length - 1]);
  assert.strictEqual(s.length, 16 * (pts.length - 1) + 1);
  for (const [lo, la] of s) assert.ok(Number.isFinite(lo) && Math.abs(la) <= 90);
  assert.deepStrictEqual(smoothPath(pts.slice(0, 2)), pts.slice(0, 2));
});

test('arrowLine densifies great-circle segments', () => {
  const l = arrowLine(
    [
      [0, 0],
      [90, 0],
    ],
    false,
  );
  assert.strictEqual(l.length, 17);
  assert.ok(Math.abs(l[8][0] - 45) < 1e-9 && Math.abs(l[8][1]) < 1e-9);
});

test('largestRing picks the biggest part and drops the closing point', () => {
  const small = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
    big = [
      [20, 0],
      [30, 0],
      [30, 10],
      [20, 10],
      [20, 0],
    ];
  const r = largestRing({ type: 'MultiPolygon', coordinates: [[small], [big]] });
  assert.deepStrictEqual(r, big.slice(0, -1));
});

test('smallUnits picks microstates and far territories, not reefs or large countries', () => {
  const topo = createRequire(import.meta.url)('world-atlas/countries-10m.json');
  const feats = feature(topo, topo.objects.countries).features.filter((f) => f.properties && f.properties.name);
  feats.forEach((f) => (f.properties.name = ALIAS[f.properties.name] || f.properties.name));
  const units = smallUnits(feats, 1e-3, NO_MARKER),
    by = new Map(units.map((u) => [u.n, u]));
  for (const n of [
    'Vatican',
    'Monaco',
    'San Marino',
    'Liechtenstein',
    'Nauru',
    'Tuvalu',
    'Maldives',
    'Gibraltar',
    'Jersey',
    'Bermuda',
    'Pitcairn Is.',
  ])
    assert.ok(by.has(n), n);
  for (const n of ['Scarborough Reef', 'Spratly Is.', 'Akrotiri', 'France', 'Cuba', 'USNB Guantanamo Bay']) assert.ok(!by.has(n), n);
  for (const u of units) assert.ok(u.a >= 0 && u.a < 1e-3 && u.c.every(Number.isFinite), u.n);
  // quantisation collapses the Vatican to a sliver of zero area, so its marker shows at every zoom
  assert.strictEqual(by.get('Vatican').a, 0);
  // the Maldives has wrongly wound islands; its area must still be tiny and its point in the Indian Ocean
  const mv = by.get('Maldives');
  assert.ok(mv.a < 1e-5 && mv.c[0] > 72 && mv.c[0] < 74.5 && mv.c[1] > -1 && mv.c[1] < 8, JSON.stringify(mv));
  const va = by.get('Vatican').c;
  assert.ok(Math.abs(va[0] - 12.45) < 0.02 && Math.abs(va[1] - 41.9) < 0.02, 'Vatican ' + va);
  assert.ok(units[0].a >= units[units.length - 1].a, 'largest first');
});
