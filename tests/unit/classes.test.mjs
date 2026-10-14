// Class breaks (src/js/classes.js): natural breaks are optimal, edges are rounded, whole numbers stay whole.
import test from 'node:test';
import assert from 'node:assert';
import { jenks, classBreaks, classIndex, classLabels, round2 } from '../../src/js/classes.js';

const sse = (v) => {
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return v.reduce((a, b) => a + (b - m) ** 2, 0);
};
// total squared deviation of sorted values split at the given edges (upper bounds)
const cost = (v, b) => {
  let t = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const c = v.filter((x, j) => (i === 0 ? x <= b[1] : x > b[i] && x <= b[i + 1]));
    if (c.length) t += sse(c);
  }
  return t;
};
// the best possible split of n sorted values into k classes, by trying every split
function brute(v, k) {
  let best = Infinity;
  const rec = (start, left, acc) => {
    if (left === 1) {
      best = Math.min(best, acc + sse(v.slice(start)));
      return;
    }
    for (let e = start + 1; e <= v.length - left + 1; e++) rec(e, left - 1, acc + sse(v.slice(start, e)));
  };
  rec(0, k, 0);
  return best;
}

test('natural breaks find the clusters and are optimal', () => {
  assert.deepStrictEqual(jenks([1, 2, 3, 100, 101, 102], 2), [1, 3, 102]);
  assert.deepStrictEqual(jenks([5, 5, 5], 3), [5, 5]);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let t = 0; t < 30; t++) {
    const v = Array.from({ length: 6 + (t % 7) }, () => Math.round(rand() * 1000) / 10).sort((a, b) => a - b),
      k = 2 + (t % 3);
    const b = jenks(v, k);
    assert.ok(Math.abs(cost(v, b) - brute(v, k)) < 1e-6, 'optimal for ' + v + ' in ' + k);
  }
});

test('skewed data is spread over the classes, not piled into the lowest', () => {
  // electoral votes per state and DC: most states are small
  const ev = [9, 3, 11, 6, 54, 10, 7, 3, 3, 30, 16, 4, 4, 19, 11, 6, 6, 8, 4, 10, 11, 15, 10, 6, 10, 4, 5, 6, 4, 14, 5, 28, 16, 3, 17, 7, 8, 19, 4, 9, 3, 11, 40, 6, 3, 13, 12, 4, 10, 3, 3];
  const eq = classBreaks(ev, 5, 'equal'),
    nb = classBreaks(ev, 5, 'jenks');
  const lowest = (b) => ev.filter((x) => classIndex(x, b.b) === 0).length;
  // equal intervals: 40 of 51 in the lowest class (3 to 13); natural breaks: 25 (3 to 7), every class used
  assert.strictEqual(lowest(eq), 40);
  assert.strictEqual(lowest(nb), 25);
  for (let i = 0; i < nb.b.length - 1; i++) assert.ok(ev.some((x) => classIndex(x, nb.b) === i), 'class ' + i + ' is used');
  // whole numbers: whole edges and ranges that do not overlap
  assert.ok(nb.int && nb.b.every(Number.isInteger));
  const labels = classLabels(nb.b, true, String);
  assert.strictEqual(labels[0].split(' to ')[0], '3');
  assert.strictEqual(labels[labels.length - 1].split(' to ')[1], '54');
  for (let i = 1; i < labels.length; i++) assert.strictEqual(+labels[i].split(' to ')[0], +labels[i - 1].split(' to ')[1] + 1);
});

test('edges are rounded to two significant figures, and values are classed by the rounded edges', () => {
  assert.deepStrictEqual([round2(2070.4), round2(0.0456), round2(57), round2(13.2)], [2100, 0.046, 57, 13]);
  const v = [302, 950, 1800, 2070, 2600, 5290, 6000, 11774, 30000, 33044, 80000, 225630];
  const { b, int } = classBreaks(v, 5, 'quantile');
  assert.strictEqual(int, true);
  assert.strictEqual(b[0], 302);
  assert.strictEqual(b[b.length - 1], 225630);
  for (const x of b.slice(1, -1)) assert.strictEqual(x, round2(x), x + ' is rounded');
  // every value falls in the class whose label covers it
  const labels = classLabels(b, false, String);
  for (const x of v) {
    const i = classIndex(x, b),
      [lo, hi] = labels[i].split(' to ').map(Number);
    assert.ok(x >= lo && x <= hi, x + ' in ' + labels[i]);
  }
  // decimals keep their shared edges
  assert.deepStrictEqual(classLabels([54.6, 61, 67, 86.5], false, String), ['54.6 to 61', '61 to 67', '67 to 86.5']);
  // one value only
  assert.deepStrictEqual(classBreaks([4, 4], 5, 'jenks').b, [4, 4]);
});
