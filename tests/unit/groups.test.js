// Unit tests: node --test tests/unit
const test = require('node:test'),
  assert = require('node:assert');
const tj = require('topojson-client'),
  world = require('world-atlas/countries-10m.json'),
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
  for (const k in exp) assert.strictEqual(Ecu.GROUPS[k].length, exp[k], k);
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
