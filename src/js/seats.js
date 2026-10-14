// Seat counter (pure, unit tested): the election maps the editor has, how many seats each unit carries, and the
// tally of a painted map: seats per paint colour, grouped by party where the colors are a party set's shades, the
// seats not yet painted ("not called"), seats held over from earlier elections, and the majority line.
// The bar itself is drawn by seatbar.js (drawSeatBar).
import { ELECTORAL_VOTES, electoralName } from './stats.js';

/**
 * US party colors for election maps, each party's shades from safe to lean, then toss-up. A tally adds up a party's
 * shades (groupOf); toss-ups count for no one. The Election picker puts these in the palette with their names.
 */
export const US_PARTIES = [
  {
    key: 'D',
    name: 'Democratic',
    members: 'Democrats',
    paints: [
      ['#1c408c', 'Safe Democratic'],
      ['#577ccc', 'Likely Democratic'],
      ['#8aafff', 'Lean Democratic'],
    ],
  },
  {
    key: 'R',
    name: 'Republican',
    members: 'Republicans',
    paints: [
      ['#bf1d29', 'Safe Republican'],
      ['#ff5865', 'Likely Republican'],
      ['#ff8b98', 'Lean Republican'],
    ],
  },
  { key: 'I', name: 'Independent', paints: [['#3c8d5a', 'Independent']] },
  { key: 'T', name: 'Toss-up', tossup: true, paints: [['#c9b98a', 'Toss-up']] },
];
/** The party a paint belongs to in US_PARTIES, or null. */
export function partyOf(paint) {
  const p = String(paint).toLowerCase();
  return US_PARTIES.find((x) => x.paints.some((q) => q[0] === p)) || null;
}

const US = 'United States of America';
/**
 * Election maps: a country's units in one layer ('' is Natural Earth's admin-1), the seats each unit carries, the
 * total that the seats must add up to, and the majority. note says what the count leaves out; hung (and tie, for an
 * exact tie between two) what happens when every seat is called and no one has a majority. split: a unit painted with
 * a two-color pattern gives half its seats to each color (a state's two senators from different parties). held:
 * seats not up at this election, by party, counted as they stand.
 */
export const ELECTIONS = [
  {
    id: 'us-ec',
    country: US,
    layer: '',
    menu: 'US President (Electoral College)',
    title: 'Electoral votes',
    unit: 'electoral votes',
    total: 538,
    majority: 270,
    seats: (p) => ELECTORAL_VOTES[electoralName(p)] || 0,
    note: 'Maine and Nebraska can split their electoral votes by district; this counts each state whole.',
    // with every state called and no candidate at 270, the House chooses (12th Amendment)
    tie: '269 to 269: no candidate has a majority, so the House of Representatives chooses the President, one vote per state delegation.',
    hung: 'No candidate has 270: the House of Representatives chooses the President from the top three, one vote per state delegation.',
  },
  {
    id: 'us-senate',
    country: US,
    layer: '',
    menu: 'US Senate (all 100 seats)',
    title: 'Senate seats',
    unit: 'seats',
    total: 100,
    majority: 51,
    seats: (p) => (p.ty === 'State' ? 2 : 0),
    split: true,
    note: 'A state painted with two colors (a striped pattern) has one senator of each. At 50 to 50 the Vice President breaks ties.',
    tie: '50 to 50: the Vice President casts the deciding vote.',
    hung: 'No party has 51 seats.',
  },
  {
    id: 'us-house',
    country: US,
    layer: 'us-cd119',
    menu: 'US House (2024 districts)',
    title: 'House seats, 119th Congress',
    unit: 'seats',
    total: 435,
    majority: 218,
    // the District of Columbia's delegate (code 1198) does not vote
    seats: (p) => (/:1198$/.test(p.c) ? 0 : 1),
    note: 'The districts of the 2024 election; some states have redrawn theirs since. The District of Columbia’s non-voting delegate is not counted.',
    hung: 'No party has 218 seats.',
  },
  {
    id: 'gb-commons',
    country: 'United Kingdom',
    layer: 'gb-wpc-2024',
    menu: 'UK House of Commons',
    title: 'House of Commons seats, 2024 boundaries',
    unit: 'seats',
    total: 650,
    majority: 326,
    seats: () => 1,
    note: '',
    hung: 'Hung parliament: no party has 326 seats.',
  },
  {
    id: 'ie-dail',
    country: 'Ireland',
    layer: 'ie-dail-2023',
    menu: 'Dáil Éireann',
    title: 'Dáil seats, 2023 boundaries',
    unit: 'seats',
    total: 174,
    majority: 88,
    seats: (p) => p.s || 0,
    note: 'Each constituency elects 3 to 5 members; painting one gives all its seats to one color.',
    hung: 'No party has 88 seats: a government needs the support of other parties or independents.',
  },
];
export const electionById = (id) => ELECTIONS.find((e) => e.id === id) || null;

/**
 * The Senate election in the bundled table (scripts/sources/stat-us-senate.json): only the seats up can be painted,
 * one per state (a state with two races would carry two), and the others count for the party holding them.
 */
export function senateElection(S) {
  const E = S.election,
    up = new Map(Object.entries(S.states).map(([n, seats]) => [n, seats.filter((x) => x.up).length])),
    held = {};
  for (const seats of Object.values(S.states)) for (const x of seats) if (!x.up) held[x.party] = (held[x.party] || 0) + 1;
  const caucus = Object.values(S.states)
    .flat()
    .filter((x) => x.caucus);
  const members = (k) => (US_PARTIES.find((p) => p.key === k) || { members: k }).members;
  const notes = [
    'Seats not up in ' + E.year + ' as held on ' + S.verified.date + '.',
    caucus.length
      ? caucus.length +
        (caucus.length === 1 ? ' independent caucuses' : ' independents caucus') +
        ' with the ' +
        members(caucus[0].caucus) +
        '.'
      : '',
    'At 50 to 50 the Vice President breaks ties.',
  ];
  return {
    id: 'us-senate-' + E.year,
    country: US,
    layer: '',
    menu: 'US Senate, ' + E.year + ' elections',
    title: 'Senate, ' + E.year + ' elections',
    unit: 'seats',
    total: 100,
    majority: 51,
    seats: (p) => (p.ty === 'State' ? up.get(p.n) || 0 : 0),
    held,
    none: 'No Senate race in ' + E.year,
    note: notes.filter(Boolean).join(' '),
    tie: '50 to 50: the Vice President casts the deciding vote.',
    hung: 'No party has 51 seats.',
  };
}
/** Add an election built from bundled data (senate.js). */
export function addElection(el) {
  if (!electionById(el.id)) ELECTIONS.push(el);
}

/**
 * The tally of one election. units are the layer's loaded units [{c: code, props}] and paintOf(code) their paint
 * (or null). order is the legend's colour order. opts.groupOf(paint) puts paints into groups (a party's shades;
 * default: each paint its own group) and opts.splitOf(paint) gives a two-color paint's two colors (elections with
 * split). Returns {total, counted, majority, parts: [{paint, seats, held?}] in legend order, groups: [{key, name?,
 * tossup?, seats, held, parts}], uncalled, winner, outcome}: counted is the seats of all units plus those held (it
 * must equal the election's total), winner the group with a majority, and outcome 'majority', 'open' (seats not
 * called), 'tie' (two groups level) or 'hung' (no majority).
 */
export function tally(el, units, paintOf, order, opts = {}) {
  const groupOf = opts.groupOf || ((p) => ({ key: p })),
    by = new Map();
  let counted = 0,
    called = 0;
  const add = (p, s) => by.set(p, (by.get(p) || 0) + s);
  for (const u of units) {
    const s = el.seats(u.props);
    counted += s;
    const p = s ? paintOf(u.c) : null;
    if (!p) continue;
    const two = el.split && opts.splitOf ? opts.splitOf(p) : null;
    if (two) {
      add(two[0], s / 2);
      add(two[1], s / 2);
    } else add(p, s);
    called += s;
  }
  const rank = (p) => {
    const i = order.indexOf(p);
    return i < 0 ? 1e9 : i;
  };
  const parts = [...by].map(([paint, seats]) => ({ paint, seats })).sort((a, b) => rank(a.paint) - rank(b.paint));
  // seats held over: a part per party, in the party's first color
  for (const [k, n] of Object.entries(el.held || {})) {
    const party = US_PARTIES.find((x) => x.key === k);
    parts.push({ paint: party ? party.paints[0][0] : k, seats: n, held: true });
    counted += n;
    called += n;
  }
  // groups in the order of their first part
  const groups = [];
  for (const x of parts) {
    const g = groupOf(x.paint),
      key = g ? g.key : x.paint;
    let G = groups.find((y) => y.key === key);
    if (!G) groups.push((G = { key, name: g && g.name, tossup: !!(g && g.tossup), seats: 0, held: 0, parts: [] }));
    G.seats += x.seats;
    if (x.held) G.held += x.seats;
    G.parts.push(x);
  }
  const winner = groups.find((g) => !g.tossup && g.seats >= el.majority) || null,
    tossups = groups.filter((g) => g.tossup).reduce((s, g) => s + g.seats, 0),
    uncalled = counted - called,
    sides = groups.filter((g) => !g.tossup);
  // every seat called and no majority: an exact tie between two, or no majority
  const outcome = winner
    ? 'majority'
    : uncalled || tossups
      ? 'open'
      : sides.length === 2 && sides[0].seats === sides[1].seats
        ? 'tie'
        : 'hung';
  return {
    total: el.total,
    counted,
    majority: el.majority,
    parts,
    groups,
    uncalled,
    winner: winner && (groups.length === parts.length ? { paint: winner.parts[0].paint, seats: winner.seats } : winner),
    outcome,
  };
}

/**
 * Where each part goes on the bar: the first group from the left end, the second from the right end, the third after
 * the first, and so on; within a group, seats held over at the outer end; toss-ups and the seats not called in the
 * middle. Returns [{paint|null, seats, held?, x, w}] with x and w as fractions of the bar.
 */
export function arrange(t) {
  const groups = t.groups || t.parts.map((p) => ({ key: p.paint, parts: [p] })),
    sides = groups.filter((g) => !g.tossup),
    outward = (g) => [...g.parts.filter((p) => p.held), ...g.parts.filter((p) => !p.held)];
  const left = sides.filter((g, i) => i % 2 === 0).flatMap(outward),
    right = sides
      .filter((g, i) => i % 2 === 1)
      .reverse()
      .flatMap((g) => outward(g).reverse()),
    middle = [...groups.filter((g) => g.tossup).flatMap((g) => g.parts), { paint: null, seats: t.uncalled }],
    total = Math.max(1, t.counted),
    out = [];
  let x = 0;
  for (const p of [...left, ...middle, ...right]) {
    out.push({ paint: p.paint, seats: p.seats, ...(p.held ? { held: true } : {}), x, w: p.seats / total });
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
