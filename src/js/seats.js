// Seat counter (pure, unit tested): the election maps the editor has, how many seats each unit carries, and the
// tally of a painted map: seats per paint colour, the seats not yet painted ("not called") and the majority line.
// The bar itself is drawn by overlay.js (drawSeatBar).
import { ELECTORAL_VOTES, electoralName } from './stats.js';

/**
 * Election maps: a country's units in one layer ('' is Natural Earth's admin-1), the seats each unit carries, the
 * total that the seats must add up to, and the majority. note says what the count leaves out.
 */
export const ELECTIONS = [
  {
    id: 'us-ec',
    country: 'United States of America',
    layer: '',
    title: 'Electoral votes',
    unit: 'electoral votes',
    total: 538,
    majority: 270,
    seats: (p) => ELECTORAL_VOTES[electoralName(p)] || 0,
    note: 'Maine and Nebraska can split their electoral votes by district; this counts each state whole.',
  },
  {
    id: 'us-house',
    country: 'United States of America',
    layer: 'us-cd119',
    title: 'House seats, 119th Congress',
    unit: 'seats',
    total: 435,
    majority: 218,
    // the District of Columbia's delegate (code 1198) does not vote
    seats: (p) => (/:1198$/.test(p.c) ? 0 : 1),
    note: 'The District of Columbia’s non-voting delegate is not counted.',
  },
  {
    id: 'gb-commons',
    country: 'United Kingdom',
    layer: 'gb-wpc-2024',
    title: 'House of Commons seats, 2024 boundaries',
    unit: 'seats',
    total: 650,
    majority: 326,
    seats: () => 1,
    note: '',
  },
  {
    id: 'ie-dail',
    country: 'Ireland',
    layer: 'ie-dail-2023',
    title: 'Dáil seats, 2023 boundaries',
    unit: 'seats',
    total: 174,
    majority: 88,
    seats: (p) => p.s || 0,
    note: 'Each constituency elects 3 to 5 members; painting one gives all its seats to one color.',
  },
];
export const electionById = (id) => ELECTIONS.find((e) => e.id === id) || null;

/**
 * The tally of one election. units are the layer's loaded units [{c: code, props}] and paintOf(code) their paint
 * (or null). order is the legend's colour order. Returns {total, counted, majority, parts: [{paint, seats}] in legend
 * order, uncalled, winner} where counted is the seats of all units (it must equal the election's total).
 */
export function tally(el, units, paintOf, order) {
  const by = new Map();
  let counted = 0,
    called = 0;
  for (const u of units) {
    const s = el.seats(u.props);
    counted += s;
    const p = s ? paintOf(u.c) : null;
    if (!p) continue;
    by.set(p, (by.get(p) || 0) + s);
    called += s;
  }
  const rank = (p) => {
    const i = order.indexOf(p);
    return i < 0 ? 1e9 : i;
  };
  const parts = [...by].map(([paint, seats]) => ({ paint, seats })).sort((a, b) => rank(a.paint) - rank(b.paint));
  const winner = parts.find((x) => x.seats >= el.majority) || null;
  return { total: el.total, counted, majority: el.majority, parts, uncalled: counted - called, winner };
}

/**
 * Where each part goes on the bar: the first colour from the left end, the second from the right end, the third
 * after the first, and so on, with the seats not called in the middle. Returns [{paint|null, seats, x, w}] with x and w
 * as fractions of the bar.
 */
export function arrange(t) {
  const left = t.parts.filter((x, i) => i % 2 === 0),
    right = t.parts.filter((x, i) => i % 2 === 1).reverse(),
    total = Math.max(1, t.counted),
    out = [];
  let x = 0;
  for (const p of [...left, { paint: null, seats: t.uncalled }, ...right]) {
    out.push({ paint: p.paint, seats: p.seats, x, w: p.seats / total });
    x += p.seats / total;
  }
  return out;
}

/** The elections a map has painted units in: ids of ELECTIONS whose country and layer appear in the painted keys. */
export function paintedElections(keys, splitKey, layerOfCode) {
  const seen = new Set();
  for (const k of keys) {
    const [n, code] = splitKey(k);
    seen.add(n + '|' + layerOfCode(code));
  }
  return ELECTIONS.filter((e) => seen.has(e.country + '|' + e.layer)).map((e) => e.id);
}
