// Writes a US Senate table the editor bundles (scripts/sources/stat-us-senate-<year>.json), one per election: for each
// state, its two seats by class, the party holding each, and which are up at that election (the regular class and any
// special elections). Read from the congress-legislators dataset (public domain, CC0), whose current file lists each
// senator's state, class, party, caucus and term; senate.gov answers scripts with "403 Forbidden".
// Usage: node scripts/fetch_senate.js <year> [path to legislators-current.json]   (downloads it when no path is given)
// Not part of CI (it needs the network). A table can be written from the day the previous election's winners take
// their seats until the day this election's winners take theirs; after that it is final and the script refuses, since
// the current senators would then include the winners. Run it after a change in the Senate, and before an election.
// A new election also needs its table imported in src/js/seatsrc.js (a unit test checks).
const fs = require('fs'),
  path = require('path'),
  crypto = require('crypto');
const URL = 'https://unitedstates.github.io/congress-legislators/legislators-current.json';
// each regular election: its class, the day, and when the new terms begin (3 January after it, 20th Amendment)
const ELECTIONS = {
  2026: { year: 2026, day: '2026-11-03', cls: 2, termsEnd: '2027-01-03' },
  2028: { year: 2028, day: '2028-11-07', cls: 3, termsEnd: '2029-01-03' },
  2030: { year: 2030, day: '2030-11-05', cls: 1, termsEnd: '2031-01-03' },
};
const ELECTION = ELECTIONS[process.argv[2]];
if (!ELECTION) {
  console.error('usage: node scripts/fetch_senate.js <' + Object.keys(ELECTIONS).join('|') + '> [legislators-current.json]');
  process.exit(1);
}
const OUT = path.join(__dirname, 'sources', 'stat-us-senate-' + ELECTION.year + '.json');
// what a new table's file says about itself; an existing file keeps its own wording
const template = (E) => ({
  id: 'stat-us-senate-' + E.year,
  kind: 'statistic',
  order: 62,
  title: 'US Senate seats: who holds each and which are up in ' + E.year + ' (election maps)',
  publisher: '@unitedstates congress-legislators, current legislators',
  url: 'https://github.com/unitedstates/congress-legislators',
  licence: { name: 'Public domain (CC0 1.0)', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  note:
    'Bundled with the editor, not fetched. Each state’s two seats by class, the party holding each, and which are up at the ' +
    E.year +
    ' election (class ' +
    ['', 'I', 'II', 'III'][E.cls] +
    ' and special elections). Written by node scripts/fetch_senate.js, which keeps parties, not names. The Senate changes between elections (deaths, resignations, appointments): the counter says the date the table was read.',
  credit: 'Senate seats: @unitedstates congress-legislators (CC0), read on {date}.',
});
const PARTY = { Democrat: 'D', Republican: 'R', Independent: 'I' };
// USPS codes to the state names the map and the electoral votes use
const STATES = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
};

async function main() {
  const today = new Date().toISOString().slice(0, 10),
    before = Object.values(ELECTIONS).find((e) => e.year === ELECTION.year - 2);
  if (today >= ELECTION.termsEnd)
    throw new Error(
      'The ' + ELECTION.year + ' table is final: its winners took their seats on ' + ELECTION.termsEnd + ', so the current senators no longer show who held the seats before it.',
    );
  if (before && today < before.termsEnd)
    throw new Error('Too early for ' + ELECTION.year + ': the ' + before.year + ' winners take their seats on ' + before.termsEnd + '; run it on or after that day.');
  let buf;
  if (process.argv[3]) buf = fs.readFileSync(process.argv[3]);
  else {
    const r = await fetch(URL);
    if (!r.ok) throw new Error(URL + ': HTTP ' + r.status);
    buf = Buffer.from(await r.arrayBuffer());
  }
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const senators = JSON.parse(buf.toString('utf8'))
    .map((p) => ({ name: p.name.official_full || p.name.first + ' ' + p.name.last, t: p.terms[p.terms.length - 1] }))
    .filter((x) => x.t.type === 'sen');
  const states = {};
  const fail = (m) => {
    throw new Error(m);
  };
  for (const { name, t } of senators) {
    const st = STATES[t.state] || fail('unknown state ' + t.state);
    const party = PARTY[t.party] || fail(name + ': unknown party ' + t.party);
    // up now: the regular class, or a seat held by appointment whose term ends at the election (a special election)
    const up = t.class === ELECTION.cls || t.end === ELECTION.day;
    const seat = { cls: t.class, party, up };
    if (party === 'I' && t.caucus) seat.caucus = PARTY[t.caucus] || fail(name + ': unknown caucus ' + t.caucus);
    if (up && t.class !== ELECTION.cls) seat.special = true;
    (states[st] = states[st] || []).push({ name, seat });
  }
  if (senators.length !== 100) fail('expected 100 senators, found ' + senators.length);
  for (const s of Object.values(STATES)) if (!states[s] || states[s].length !== 2) fail(s + ': expected two senators');
  // the table keeps parties, not names; the names are printed here for checking
  const out = {};
  for (const s of Object.keys(states).sort()) {
    out[s] = states[s].map((x) => x.seat).sort((a, b) => a.cls - b.cls);
    for (const x of states[s])
      if (x.seat.up || x.seat.caucus)
        console.log(
          s.padEnd(15),
          x.name.padEnd(28),
          x.seat.party,
          'class',
          x.seat.cls,
          x.seat.up ? 'UP' + (x.seat.special ? ' (special)' : '') : '',
          x.seat.caucus ? 'caucuses ' + x.seat.caucus : '',
        );
  }
  const seats = Object.values(out).flat(),
    count = (f) => {
      const c = {};
      for (const x of seats.filter(f)) c[x.party] = (c[x.party] || 0) + 1;
      return c;
    };
  const result = { all: count(() => true), up: seats.filter((x) => x.up).length, held: count((x) => !x.up) };
  console.log('all', result.all, '| up', result.up, '| not up', result.held, '| sha256', sha256);
  const entry = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : template(ELECTION);
  entry.election = ELECTION;
  entry.verified = { date: today, by: 'node scripts/fetch_senate.js ' + ELECTION.year, origin: URL, sha256, result };
  entry.states = '@states';
  // one line per state
  const lines = Object.entries(out).map(([s, v]) => '    ' + JSON.stringify(s) + ': ' + JSON.stringify(v));
  fs.writeFileSync(OUT, JSON.stringify(entry, null, 2).replace('"@states"', '{\n' + lines.join(',\n') + '\n  }') + '\n');
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
