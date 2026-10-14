// Seat counter (src/js/seats.js): every election map's seats add up to the real total, and the tally and bar layout.
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { ELECTIONS, electionById, tally, arrange, paintedElections, senateElection, partyOf, US_PARTIES } from '../../src/js/seats.js';

const file = (p) => JSON.parse(readFileSync(new URL('../../' + p, import.meta.url), 'utf8'));
const SENATE = file('scripts/sources/stat-us-senate.json');
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
  const expected = {
    'us-ec': [538, 270],
    'us-senate': [100, 51],
    'us-house': [435, 218],
    'gb-commons': [650, 326],
    'ie-dail': [174, 88],
    'us-senate-2026': [100, 51],
  };
  assert.deepStrictEqual(
    ELECTIONS.map((e) => e.id).sort(),
    Object.keys(expected)
      .filter((k) => k !== 'us-senate-2026')
      .sort(),
  );
  for (const el of [...ELECTIONS, senateElection(SENATE)]) {
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

test('outcomes: open, majority, a 269 to 269 tie, and no majority with three colors', () => {
  const el = electionById('us-ec'),
    units = unitsOf(el).filter((u) => el.seats(u.props));
  // a set of states worth exactly 269 votes (subset sum over the states' votes)
  const reach = new Map([[0, []]]);
  for (const u of units)
    for (const [sum, set] of [...reach])
      if (sum + el.seats(u.props) <= 269 && !reach.has(sum + el.seats(u.props))) reach.set(sum + el.seats(u.props), [...set, u.c]);
  const half = new Set(reach.get(269));
  const tie = tally(el, units, (c) => (half.has(c) ? 'a' : 'b'), []);
  assert.deepStrictEqual([tie.parts.map((x) => x.seats), tie.outcome], [[269, 269], 'tie']);
  assert.match(el.tie, /^269 to 269/);
  // one state moved to a third color: no one has 270
  const third = [...half][0];
  const hung = tally(el, units, (c) => (c === third ? 'c' : half.has(c) ? 'a' : 'b'), []);
  assert.strictEqual(hung.outcome, 'hung');
  assert.strictEqual(tally(el, units, (c) => (half.has(c) ? 'a' : null), []).outcome, 'open');
  assert.strictEqual(tally(el, units, () => 'a', []).outcome, 'majority');
  // every election says what happens without a majority
  for (const e of ELECTIONS) assert.ok(e.hung, e.id);
});

test('the 2026 Senate table: 50 states, two seats each, 35 up, the rest counted for the party holding them', () => {
  const S = SENATE,
    states = Object.entries(S.states);
  assert.strictEqual(states.length, 50);
  for (const [n, seats] of states) {
    assert.strictEqual(seats.length, 2, n);
    // a state's two seats are in different classes
    assert.notStrictEqual(seats[0].cls, seats[1].cls, n);
    for (const x of seats) assert.ok(['D', 'R', 'I'].includes(x.party), n);
  }
  const up = states.flatMap(([n, s]) => s.filter((x) => x.up).map(() => n));
  assert.strictEqual(up.length, 35);
  // every class II seat is up, plus the special elections
  for (const [n, seats] of states) for (const x of seats) if (x.cls === S.election.cls) assert.ok(x.up, n + ' class II');
  assert.deepStrictEqual(
    states.filter(([, s]) => s.some((x) => x.special)).map(([n]) => n),
    ['Florida', 'Ohio'],
  );
  assert.deepStrictEqual(S.verified.result, { all: { R: 53, D: 45, I: 2 }, up: 35, held: { R: 31, D: 32, I: 2 } });
  const el = senateElection(S),
    units = unitsOf(electionById('us-ec'));
  const t = tally(el, units, () => null, []);
  assert.deepStrictEqual([t.counted, t.uncalled], [100, 35]);
  assert.deepStrictEqual(Object.fromEntries(t.groups.map((g) => [g.key, g.seats])), { '#1c408c': 32, '#bf1d29': 31, '#3c8d5a': 2 });
  assert.match(el.note, /2 independents caucus with the Democrats/);
  // DC and the "Rest of" unit carry no Senate seat
  assert.strictEqual(units.filter((u) => el.seats(u.props)).length, 35);
});

test('party groups: a party’s shades add up, toss-ups count for no one, holdovers sit at the outer ends', () => {
  const el = senateElection(SENATE),
    units = unitsOf(electionById('us-ec')).filter((u) => el.seats(u.props));
  const [safeD, likelyD, leanD] = US_PARTIES[0].paints.map((p) => p[0]),
    [safeR] = US_PARTIES[1].paints.map((p) => p[0]),
    toss = US_PARTIES[3].paints[0][0];
  assert.strictEqual(partyOf(likelyD.toUpperCase()).key, 'D');
  assert.strictEqual(partyOf('#123456'), null);
  const paint = (u, i) => [safeD, likelyD, leanD, safeR, toss][i % 5];
  const byCode = new Map(units.map((u, i) => [u.c, paint(u, i)]));
  const groupOf = (p) => {
    const P = partyOf(p);
    return P && { key: P.key, name: P.name, tossup: P.tossup };
  };
  const t = tally(el, units, (c) => byCode.get(c) || null, [], { groupOf });
  const g = Object.fromEntries(t.groups.map((x) => [x.key, [x.seats, x.held]]));
  // 35 seats: 7 of each of the five colors
  assert.deepStrictEqual(g, { D: [32 + 21, 32], R: [31 + 7, 31], I: [2, 2], T: [7, 0] });
  assert.strictEqual(t.outcome, 'majority');
  assert.strictEqual(t.winner.key, 'D');
  const bar = arrange(t);
  // Democrats from the left, held seats first; toss-ups in the middle; Republicans from the right, held seats last
  assert.deepStrictEqual(bar[0], { paint: safeD, seats: 32, held: true, x: 0, w: 0.32 });
  assert.strictEqual(bar[bar.length - 1].held, true);
  assert.strictEqual(bar[bar.length - 1].paint, safeR);
  assert.ok(bar.some((b) => b.paint === toss));
});

test('the Senate composition map: two seats a state, and a two-color pattern gives one to each', () => {
  const el = electionById('us-senate'),
    units = unitsOf(electionById('us-ec'));
  assert.strictEqual(
    units.reduce((s, u) => s + el.seats(u.props), 0),
    100,
  );
  const split = 'p:diagw:#1c408c:#bf1d29';
  const t = tally(el, units, () => split, [], { splitOf: (p) => (p === split ? ['#1c408c', '#bf1d29'] : null) });
  assert.deepStrictEqual(
    t.parts.map((x) => [x.paint, x.seats]),
    [
      ['#1c408c', 50],
      ['#bf1d29', 50],
    ],
  );
  assert.strictEqual(t.outcome, 'tie');
  assert.match(el.tie, /Vice President/);
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
    'us-senate',
    'gb-commons',
  ]);
  assert.deepStrictEqual(paintedElections(['United Kingdom|gb-cua-2025:E06000001', 'France|FRA-2000'], split, layer), []);
});
