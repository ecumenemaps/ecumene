// Unit tests: node --test tests/unit
const test = require('node:test'),
  assert = require('node:assert');
const tj = require('topojson-client'),
  { OVERSEAS, splitOverseas } = require('../../src/overseas.js'),
  world = splitOverseas(require('world-atlas/countries-10m.json'), tj.feature),
  Ecu = require('../../src/groups.js');
const A = { Baikonur: 'Kazakhstan', 'USNB Guantanamo Bay': 'Cuba' };
const names = [
  ...new Set(
    tj
      .feature(world, world.objects.countries)
      .features.filter((f) => f.properties && f.properties.name)
      .map((f) => A[f.properties.name] || f.properties.name),
  ),
];
const r = Ecu.matcher(names);

test('every group name exists on the map', () => {
  for (const g in Ecu.GROUPS) for (const n of Ecu.GROUPS[g]) assert.ok(names.includes(n), g + ': ' + n);
});
test('continents partition every map area exactly once', () => {
  const seen = new Map();
  for (const c in Ecu.CONTINENTS)
    for (const n of Ecu.CONTINENTS[c]) {
      assert.ok(!seen.has(n), n + ' twice');
      seen.set(n, c);
    }
  for (const n of names) assert.ok(seen.has(n), 'no continent: ' + n);
});
test('group sizes', () => {
  const exp = {
    'European Union (27)': 27,
    'Eurozone (21)': 21,
    'NATO (32)': 32,
    G7: 7,
    'G20 (19 countries)': 19,
    'ASEAN (11)': 11,
    'UN Security Council permanent members': 5,
  };
  // the counts are member states; overseas parts that belong (France's regions in the EU) come on top
  const parts = new Set(OVERSEAS.map((p) => p.name));
  for (const k in exp) assert.strictEqual(Ecu.GROUPS[k].filter((n) => !parts.has(n)).length, exp[k], k);
});
test('overseas parts sit in their own continent and only in groups they belong to', () => {
  const where = (n) => Object.keys(Ecu.CONTINENTS).find((c) => Ecu.CONTINENTS[c].includes(n));
  assert.strictEqual(where('French Guiana'), 'South America');
  for (const n of ['Guadeloupe', 'Martinique', 'Caribbean Netherlands']) assert.strictEqual(where(n), 'North America', n);
  for (const n of ['Réunion', 'Mayotte']) assert.strictEqual(where(n), 'Africa', n);
  const eu = Ecu.GROUPS['European Union (27)'];
  assert.ok(eu.includes('French Guiana') && eu.includes('Réunion'));
  assert.ok(!eu.includes('Caribbean Netherlands'), 'the Caribbean Netherlands is not in the EU');
  assert.ok(!Ecu.GROUPS['NATO (32)'].includes('French Guiana'), 'outside the North Atlantic Treaty area');
  assert.strictEqual(r('French Guyana'), 'French Guiana');
  assert.strictEqual(r('Reunion'), 'Réunion');
  assert.strictEqual(r('Bonaire'), 'Caribbean Netherlands');
});
test('the overseas split moves whole polygons and keeps every other country in place', () => {
  const before = require('world-atlas/countries-10m.json').objects.countries.geometries,
    after = world.objects.countries.geometries;
  assert.strictEqual(after.length, before.length + OVERSEAS.length);
  before.forEach((g, i) => assert.strictEqual(after[i].properties.name, g.properties.name, 'index ' + i));
  const n = (name, gs) => gs.find((g) => g.properties.name === name).arcs.length;
  let moved = 0;
  for (const p of OVERSEAS) moved += after.find((g) => g.properties.name === p.name).type === 'Polygon' ? 1 : n(p.name, after);
  assert.strictEqual(n('France', before) + n('Netherlands', before), n('France', after) + n('Netherlands', after) + moved);
});
test('aliases resolve', () => {
  const cases = {
    USA: 'United States of America',
    'the Gambia': 'Gambia',
    "Cote d'Ivoire": "Côte d'Ivoire",
    'Ivory Coast': "Côte d'Ivoire",
    'czech republic': 'Czechia',
    Niger: 'Niger',
    Nigeria: 'Nigeria',
    'Bosnia & Herzegovina': 'Bosnia and Herz.',
    'Saint Kitts and Nevis': 'St. Kitts and Nevis',
    'DR Congo': 'Dem. Rep. Congo',
    'North Macedonia': 'Macedonia',
    Turkiye: 'Turkey',
    Aland: 'Åland',
  };
  for (const k in cases) assert.strictEqual(r(k), cases[k], k);
  for (const k in Ecu.ALIAS_RAW) assert.ok(names.includes(Ecu.ALIAS_RAW[k]), 'alias target ' + k);
});
test('parseList dedupes and reports unknowns', () => {
  const o = Ecu.parseList('France; france\nAtlantis, Peru', r);
  assert.deepStrictEqual(o.found, ['France', 'Peru']);
  assert.deepStrictEqual(o.unknown, ['Atlantis']);
});
test('parseData handles separators, thousands, percents, duplicates', () => {
  const d = Ecu.parseData('France, 68\nGermany;83.5\n"Ivory Coast"\t1,234\nAtlantis, 4\nSpain 5\nItaly: 12%\nFrance, 70\nPeru, 3,5', r);
  assert.deepStrictEqual(d.rows, [
    { name: 'France', value: 70 },
    { name: 'Germany', value: 83.5 },
    { name: "Côte d'Ivoire", value: 1234 },
    { name: 'Italy', value: 12 },
    { name: 'Peru', value: 3.5 },
  ]);
  assert.deepStrictEqual(d.unknown, ['Atlantis']);
  assert.deepStrictEqual(d.bad, ['Spain 5']);
});
test('breaks and classes', () => {
  assert.deepStrictEqual(Ecu.breaks([1, 2, 3, 10], 3, 'equal'), [1, 4, 7, 10]);
  const q = Ecu.breaks([1, 2, 3, 10, 11, 12], 3, 'quantile');
  assert.strictEqual(q.length, 4);
  assert.strictEqual(q[0], 1);
  assert.strictEqual(q[3], 12);
  assert.deepStrictEqual(Ecu.breaks([5, 5, 5], 4, 'equal'), [5]);
  assert.strictEqual(Ecu.classOf(1, [1, 4, 7, 10]), 0);
  assert.strictEqual(Ecu.classOf(4.5, [1, 4, 7, 10]), 1);
  assert.strictEqual(Ecu.classOf(10, [1, 4, 7, 10]), 2);
});
test('number formatting', () => {
  assert.strictEqual(Ecu.fmt(1234567), '1.23M');
  assert.strictEqual(Ecu.fmt(0.04567), '0.046');
  assert.strictEqual(Ecu.fmt(12345), '12,345');
  assert.strictEqual(Ecu.fmt(0), '0');
  assert.strictEqual(Ecu.fmt(-2500000000), '-2.5B');
});
test('every membership group names its source and when it was checked', () => {
  const { loadSources } = require('../../scripts/lib/sources.js');
  const ids = loadSources().map((s) => s.id);
  for (const k of [
    'European Union (27)',
    'Eurozone (21)',
    'NATO (32)',
    'G7',
    'G20 (19 countries)',
    'ASEAN (11)',
    'UN Security Council permanent members',
    ...Object.keys(Ecu.CONTINENTS),
  ]) {
    assert.ok(Ecu.GROUP_SOURCES[k], k + ' has no source');
    assert.ok(Ecu.groupNote(k).includes('Membership checked against ' + Ecu.GROUP_SOURCES[k] + ' on ' + Ecu.GROUPS_CHECKED), k);
  }
  // the groups' sources are in the README table
  for (const id of ['groups-eu', 'groups-nato', 'groups-un', 'groups-g7-g20', 'groups-asean', 'groups-wikidata', 'groups-continents'])
    assert.ok(ids.includes(id), id);
  // the G20 note says the 2026 presidency's own list differs
  assert.ok(Ecu.groupNote('G20 (19 countries)').includes('South Africa'));
  // continents name the UN classification, and their notes come first
  assert.ok(Ecu.groupNote('Asia').startsWith(Ecu.GROUP_NOTES.Asia + ' Membership checked against the UN Statistics Division'));
});
test('continents follow the UN M49 classification', () => {
  const where = (n) => Object.keys(Ecu.CONTINENTS).find((c) => Ecu.CONTINENTS[c].includes(n));
  // Cyprus is in Western Asia in M49; the other places on the island go with it
  for (const n of ['Cyprus', 'N. Cyprus', 'Cyprus U.N. Buffer Zone', 'Akrotiri', 'Dhekelia']) assert.strictEqual(where(n), 'Asia', n);
  assert.strictEqual(where('Russia'), 'Europe');
  for (const n of ['Turkey', 'Georgia', 'Armenia', 'Azerbaijan', 'Kazakhstan']) assert.strictEqual(where(n), 'Asia', n);
  // the Southern Ocean islands
  assert.strictEqual(where('S. Geo. and the Is.'), 'South America');
  assert.strictEqual(where('Heard I. and McDonald Is.'), 'Oceania');
  assert.strictEqual(where('Fr. S. Antarctic Lands'), 'Africa');
  assert.deepStrictEqual(Ecu.CONTINENTS.Antarctica, ['Antarctica']);
  // islands M49 puts with a continent though Natural Earth calls them open ocean
  for (const n of ['Seychelles', 'Mauritius', 'Saint Helena', 'Br. Indian Ocean Ter.']) assert.strictEqual(where(n), 'Africa', n);
  assert.strictEqual(where('Maldives'), 'Asia');
});
