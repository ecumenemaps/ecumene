// Seat counter (src/js/seats.js): every election map's seats add up to the real total, and the tally and bar layout.
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { ELECTIONS, electionById, tally, arrange, paintedElections } from '../../src/js/seats.js';

const file = (p) => JSON.parse(readFileSync(new URL('../../' + p, import.meta.url), 'utf8'));
// the units of an election as the editor loads them: layer codes carry the layer's id (units.js)
function unitsOf(el) {
  let t;
  if (el.layer) {
    const entry = file('data/layers/index.json')[el.country].find((x) => x.id === el.layer);
    t = file('data/layers/' + entry.f);
  } else t = file('data/admin1/' + file('data/admin1/index.json')[el.country].f);
  return t.objects.u.geometries.map((g) => {
    const props = { ...g.properties };
    if (el.layer) props.c = el.layer + ':' + props.c;
    return { c: props.c, props };
  });
}

test('every election map adds up to its real total', () => {
  const expected = { 'us-ec': [538, 270], 'us-house': [435, 218], 'gb-commons': [650, 326], 'ie-dail': [174, 88] };
  assert.deepStrictEqual(ELECTIONS.map((e) => e.id).sort(), Object.keys(expected).sort());
  for (const el of ELECTIONS) {
    const t = tally(el, unitsOf(el), () => null, []);
    assert.strictEqual(t.counted, el.total, el.id + ': seats of all units');
    assert.deepStrictEqual([el.total, el.majority], expected[el.id], el.id);
    // a majority is more than half
    assert.strictEqual(el.majority, Math.floor(el.total / 2) + 1, el.id + ' majority');
  }
});

test('the tally counts painted seats per colour, in legend order, and finds a winner', () => {
  const el = electionById('us-ec'),
    units = unitsOf(el);
  const code = (state) => units.find((u) => u.props.ty === 'State' && u.props.n === state).c;
  const paint = new Map([
    [code('California'), '#2166ac'],
    [code('Texas'), '#b2182b'],
    [code('Florida'), '#b2182b'],
    [code('New York'), '#2166ac'],
  ]);
  const t = tally(el, units, (c) => paint.get(c) || null, ['#b2182b', '#2166ac']);
  assert.deepStrictEqual(t.parts, [
    { paint: '#b2182b', seats: 70 },
    { paint: '#2166ac', seats: 82 },
  ]);
  assert.strictEqual(t.uncalled, 538 - 152);
  assert.strictEqual(t.winner, null);
  // every state painted one colour: that colour wins
  const all = tally(el, units, () => '#2166ac', []);
  assert.deepStrictEqual(all.winner, { paint: '#2166ac', seats: 538 });
  // the DC delegate counts no House seat
  const house = electionById('us-house');
  assert.strictEqual(house.seats({ c: 'us-cd119:1198' }), 0);
  assert.strictEqual(house.seats({ c: 'us-cd119:0601' }), 1);
});

test('the bar: first colour from the left, second from the right, not called in the middle', () => {
  const t = {
    counted: 100,
    uncalled: 40,
    parts: [
      { paint: 'a', seats: 30 },
      { paint: 'b', seats: 20 },
      { paint: 'c', seats: 10 },
    ],
  };
  const bar = arrange(t);
  assert.deepStrictEqual(
    bar.map((x) => [x.paint, x.seats]),
    [
      ['a', 30],
      ['c', 10],
      [null, 40],
      ['b', 20],
    ],
  );
  assert.ok(Math.abs(bar[3].x + bar[3].w - 1) < 1e-9);
  assert.strictEqual(bar[2].x, 0.4);
});

test('which elections a map has painted', () => {
  const split = (k) => [k.slice(0, k.indexOf('|')), k.slice(k.indexOf('|') + 1)],
    layer = (c) => (c.includes(':') ? c.slice(0, c.indexOf(':')) : '');
  assert.deepStrictEqual(paintedElections(['United States of America|USA-3514', 'United Kingdom|gb-wpc-2024:E14001063'], split, layer), [
    'us-ec',
    'gb-commons',
  ]);
  assert.deepStrictEqual(paintedElections(['United Kingdom|gb-cua-2025:E06000001', 'France|FRA-2000'], split, layer), []);
});
