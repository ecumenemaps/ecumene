// Color schemes and color-vision simulation (src/js/schemes.js).
import test from 'node:test';
import assert from 'node:assert';
import {
  SCALES,
  PAINT_SETS,
  classColors,
  divergingBreaks,
  simulate,
  deltaE,
  deltaE00,
  clashes,
  safetyNote,
  CVD,
} from '../../src/js/schemes.js';

test('CIEDE2000 matches the published test pairs (Sharma, Wu and Dalal 2005)', () => {
  const pairs = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
    [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
  ];
  for (const [a, b, e] of pairs) assert.ok(Math.abs(deltaE00(a, b) - e) < 1e-4, deltaE00(a, b) + ' vs ' + e);
  assert.strictEqual(deltaE('#123456', '#123456'), 0);
});

test('simulation keeps neutrals neutral and loses red-green contrast for deuteranopia', () => {
  for (const t of Object.keys(CVD))
    for (const g of ['#ffffff', '#000000', '#808080']) assert.ok(deltaE(simulate(g, t), g) < 1, t + ' ' + g);
  // pure red and green are far apart normally, much closer for deuteranopia and protanopia
  assert.ok(deltaE('#d62728', '#2ca02c') > 50);
  assert.ok(deltaE(simulate('#d62728', 'deuteranopia'), simulate('#2ca02c', 'deuteranopia')) < 25);
  // achromatopsia is grey
  const s = simulate('#3d8bd9', 'achromatopsia');
  assert.ok(s.slice(1, 3) === s.slice(3, 5) && s.slice(3, 5) === s.slice(5, 7), s);
});

test('clash check: Okabe–Ito is clear for every deficiency, the default set is not', () => {
  assert.deepStrictEqual(clashes(PAINT_SETS['Okabe–Ito'].c), []);
  const c = clashes(PAINT_SETS.Default.c);
  assert.ok(c.length > 0);
  for (const x of c) assert.ok(['deuteranopia', 'protanopia', 'tritanopia'].includes(x.type));
});

test('class colors: k distinct colors, light to dark for sequential scales, reversible', () => {
  const L = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  };
  for (const [name, S] of Object.entries(SCALES))
    for (let k = 2; k <= 9; k++) {
      const c = classColors(name, k);
      assert.strictEqual(c.length, k, name + ' ' + k);
      assert.strictEqual(new Set(c).size, k, name + ' ' + k + ' colors repeat');
      for (const x of c) assert.match(x, /^#[0-9a-f]{6}$/);
      if (S.kind === 'seq' && !S.f) for (let i = 1; i < k; i++) assert.ok(L(c[i]) < L(c[i - 1]), name + ' ' + k + ' gets darker');
      assert.deepStrictEqual(classColors(name, k, true), c.slice().reverse());
    }
  // the lightest Blues class is not the near-white end of the scale
  assert.notStrictEqual(classColors('Blues', 5)[0], '#eff3ff');
});

test('diverging breaks are symmetric about the centre', () => {
  const b = divergingBreaks([-3, 1, 8], 4, 0);
  assert.deepStrictEqual(b, [-8, -4, 0, 4, 8]);
  const c = divergingBreaks([10, 12, 20], 3, 15);
  assert.strictEqual(c.length, 4);
  assert.ok(Math.abs(c[0] + c[3] - 30) < 1e-9, 'centre in the middle');
  assert.ok(c[1] < 15 && c[2] > 15, 'odd counts straddle the centre');
});

test('every scale and paint set says whether it is color-blind safe', () => {
  for (const S of [...Object.values(SCALES), ...Object.values(PAINT_SETS)]) assert.match(safetyNote(S), /color-blind safe/i);
  assert.strictEqual(safetyNote(PAINT_SETS['Okabe–Ito']), 'Color-blind safe.');
  assert.strictEqual(safetyNote(PAINT_SETS['Set 2']), 'Color-blind safe for up to 3 colors.');
  assert.strictEqual(safetyNote(SCALES.Viridis), 'Color-blind safe, prints well.');
});
