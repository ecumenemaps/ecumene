// Writes the US Senate table the editor bundles (scripts/sources/stat-us-senate.json): for each state, its two seats
// by class, the party holding each, and which are up at the next election (the regular class and any special
// elections). Read from the congress-legislators dataset (public domain, CC0), whose current file lists each
// senator's state, class, party, caucus and term; senate.gov answers scripts with "403 Forbidden".
// Usage: node scripts/fetch_senate.js [path to legislators-current.json]   (downloads it when no path is given)
// Not part of CI (it needs the network); run it after a change in the Senate, and before and after an election.
const fs = require('fs'),
  path = require('path'),
  crypto = require('crypto');
const URL = 'https://unitedstates.github.io/congress-legislators/legislators-current.json';
const OUT = path.join(__dirname, 'sources', 'stat-us-senate.json');
// the regular election this table is for: its class, the day, and when the new terms begin
const ELECTION = { year: 2026, day: '2026-11-03', cls: 2, termsEnd: '2027-01-03' };
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
  let buf;
  if (process.argv[2]) buf = fs.readFileSync(process.argv[2]);
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
  const entry = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  entry.election = ELECTION;
  entry.verified = { date: new Date().toISOString().slice(0, 10), by: 'node scripts/fetch_senate.js', origin: URL, sha256, result };
  entry.states = '@states';
  // one line per state
  const lines = Object.entries(out).map(([s, v]) => '    ' + JSON.stringify(s) + ': ' + JSON.stringify(v));
  fs.writeFileSync(OUT, JSON.stringify(entry, null, 2).replace('"@states"', '{\n' + lines.join(',\n') + '\n  }') + '\n');
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
