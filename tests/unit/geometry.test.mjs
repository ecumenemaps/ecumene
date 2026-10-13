// Unit tests for the pure modules: data decoding and spherical geometry.
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { geoContains, geoArea } from 'd3-geo';
import { inflate, decodeTris, decodePhys } from '../../src/js/decode.js';
import { ringPolygon, labelAnchor, smoothPath, arrowLine, largestRing } from '../../src/js/shapes.js';

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
