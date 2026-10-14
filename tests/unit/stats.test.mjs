// Statistics (src/js/stats.js, scripts/sources/stat-*.json): the source list, matching to countries, the year choice.
import test from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
import {
  parseWB,
  chooseYear,
  valuesFor,
  yearsWithData,
  wbRecord,
  wbTitle,
  wbCredit,
  wbDetails,
  wbURL,
  isoOf,
  matchCountries,
  validRecord,
  electoralName,
  ELECTORAL_VOTES,
  HOUSE_SEATS,
  WINDOW,
} from '../../src/js/stats.js';

const require = createRequire(import.meta.url);
const { statistics, readmeTable } = require('../../scripts/lib/sources.js');
const world = require('../../src/overseas.js').splitOverseas(require('world-atlas/countries-10m.json'), feature);
const countries = feature(world, world.objects.countries).features.filter((f) => f.properties && f.properties.name);
const wb = statistics().find((s) => s.id === 'stat-worldbank');

test('every statistic in the source list has a licence, a credit and complete indicators', () => {
  assert.ok(statistics().length >= 2);
  for (const s of statistics()) {
    assert.ok(s.licence.name && s.licence.url, s.id + ' licence');
    assert.ok(s.credit && s.publisher && s.url && s.note, s.id + ' credit');
  }
  assert.strictEqual(wb.licence.name, 'CC BY 4.0');
  const codes = new Set();
  for (const i of wb.indicators) {
    assert.match(i.code, /^[A-Z0-9.]+$/);
    assert.ok(i.menu && i.title && i.origin, i.code);
    assert.ok(!codes.has(i.code), 'duplicate ' + i.code);
    codes.add(i.code);
  }
  assert.ok(codes.has('NY.GDP.PCAP.CD') && codes.has('SP.DYN.LE00.IN'));
  // the README table names both
  const t = readmeTable();
  assert.ok(t.includes('World Development Indicators') && t.includes('2020 Census apportionment'));
});

test('ISO matching covers the main countries and the split-out overseas parts', () => {
  const byIso = new Map();
  for (const f of countries) if (isoOf(f)) byIso.set(isoOf(f), f.properties.name);
  const want = {
    USA: 'United States of America',
    GBR: 'United Kingdom',
    FRA: 'France',
    DEU: 'Germany',
    CHN: 'China',
    IND: 'India',
    BRA: 'Brazil',
    RUS: 'Russia',
    JPN: 'Japan',
    NGA: 'Nigeria',
    ZAF: 'South Africa',
    AUS: 'Australia',
    CAN: 'Canada',
    NOR: 'Norway',
    PSE: 'Palestine',
    XKX: 'Kosovo',
    GUF: 'French Guiana',
    REU: 'Réunion',
    MYT: 'Mayotte',
  };
  for (const [iso, name] of Object.entries(want)) assert.strictEqual(byIso.get(iso), name, iso);
  // no two places share a code, and every sovereign state on the map has one
  const codes = countries.map(isoOf).filter(Boolean);
  assert.strictEqual(new Set(codes).size, codes.length);
  const without = countries.filter((f) => !isoOf(f)).map((f) => f.properties.name);
  for (const n of ['Somaliland', 'N. Cyprus', 'Siachen Glacier', 'Baikonur']) assert.ok(without.includes(n), n);
  assert.ok(codes.length >= 240, 'matched ' + codes.length);
});

const rows = (list) => [{ page: 1 }, list.map(([iso, date, value]) => ({ countryiso3code: iso, date: String(date), value }))];

test('parseWB keeps countries, drops regions and empty values', () => {
  const r = parseWB(
    rows([
      ['FRA', 2023, 44000.123456789],
      ['WLD', 2023, 13000],
      ['EUU', 2023, 1],
      ['DEU', 2023, null],
      ['DEU', 2022, 48000],
      ['XKX', 2023, 6000],
      ['', 2023, 5],
    ]),
  );
  assert.deepStrictEqual(r[2023], { FRA: 44000.12, XKX: 6000 });
  assert.deepStrictEqual(r[2022], { DEU: 48000 });
  assert.throws(() => parseWB({ message: 1 }), /list of values/);
  assert.throws(() => parseWB([{ message: [{ value: 'Invalid format' }] }]), /Invalid format/);
  assert.throws(() => parseWB([{ page: 1 }, null]), /no values/);
});

test('the year choice: latest year with good coverage', () => {
  const mk = (n) =>
    Object.fromEntries(
      Array.from({ length: n }, (_, i) => ['C' + String.fromCharCode(65 + (i % 26)) + String.fromCharCode(65 + Math.floor(i / 26)), i]),
    );
  // 200 countries up to 2022, 195 in 2023 (97%: good), 120 in 2024 (60%: thin)
  const by = { 2021: mk(200), 2022: mk(200), 2023: mk(195), 2024: mk(120) };
  assert.strictEqual(chooseYear(by), 2023);
  assert.strictEqual(chooseYear({ 2022: mk(200), 2023: mk(170) }), 2022);
  assert.strictEqual(chooseYear({}), null);
  assert.deepStrictEqual(yearsWithData({ 2020: mk(3), 2021: {}, 2022: mk(1) }), [2022, 2020]);
});

test('a chosen year gives that year; "latest" gives each country its most recent value and year', () => {
  const by = { 2021: { FRA: 1, DEU: 2, TUV: 9 }, 2022: { FRA: 3, DEU: 4 }, 2023: { FRA: 5 } };
  assert.deepStrictEqual(valuesFor(by, 2022), { v: { FRA: 3, DEU: 4 } });
  assert.strictEqual(valuesFor(by, 2019), null);
  assert.deepStrictEqual(valuesFor(by, 'latest'), { v: { FRA: 5, DEU: 4, TUV: 9 }, ys: { FRA: 2023, DEU: 2022, TUV: 2021 } });
});

test('title, credit and details say the indicator, year and source', () => {
  const ind = wb.indicators.find((i) => i.code === 'NY.GDP.PCAP.CD');
  const one = wbRecord(ind.code, 2023, '2026-10-14', { v: { FRA: 1 } });
  assert.strictEqual(wbTitle(ind, one), 'GDP per capita (current US$), 2023');
  assert.strictEqual(wbCredit(wb, ind, one), 'World Bank, World Development Indicators, NY.GDP.PCAP.CD, 2023, CC BY 4.0');
  const many = wbRecord(ind.code, 'latest', '2026-10-14', { v: { FRA: 1, DEU: 2 }, ys: { FRA: 2023, DEU: 2019 } });
  assert.strictEqual(wbTitle(ind, many), 'GDP per capita (current US$), most recent available, 2019–2023');
  assert.ok(wbCredit(wb, ind, many).includes('most recent year per country (2019–2023)'));
  assert.ok(wbDetails(wb, ind, one).includes('Fetched from the World Bank on 2026-10-14'));
  assert.match(
    wbURL(ind.code, 2026),
    new RegExp('^https://api\\.worldbank\\.org/v2/country/all/indicator/NY\\.GDP\\.PCAP\\.CD\\?.*date=' + (2026 - WINDOW) + ':2026'),
  );
});

test('matching values to countries: overseas parts without values have no data', () => {
  const rec = wbRecord('SP.POP.TOTL', 2023, '2026-10-14', { v: { FRA: 68e6, DEU: 84e6, XKX: 1.7e6 } });
  const m = matchCountries(countries, rec);
  assert.strictEqual(m.with.get('France').value, 68e6);
  assert.strictEqual(m.with.get('Kosovo').value, 1.7e6);
  assert.ok(!m.with.has('French Guiana') && m.without.includes('French Guiana'));
  assert.ok(m.without.includes('Antarctica') && m.without.includes('Somaliland'));
  assert.strictEqual(m.with.size + m.without.length, new Set(countries.map((f) => f.properties.name)).size);
});

test('saved records are validated', () => {
  const good = { k: 'wb', c: 'NY.GDP.PCAP.CD', y: 2023, t: '2026-10-14', v: { FRA: 1.5, DEU: 2 } };
  assert.deepStrictEqual(validRecord(good), good);
  assert.deepStrictEqual(validRecord({ ...good, v: { FRA: 1, fr: 2, DEU: 'x', ESP: NaN } }).v, { FRA: 1 });
  assert.strictEqual(validRecord({ ...good, c: '../x' }), null);
  assert.strictEqual(validRecord({ ...good, y: 'soon' }), null);
  assert.strictEqual(validRecord({ ...good, t: 'yesterday' }), null);
  assert.strictEqual(validRecord(null), null);
  assert.deepStrictEqual(validRecord({ k: 'ev', extra: 1 }), { k: 'ev' });
  const latest = { ...good, y: 'latest', ys: { FRA: 2022, DEU: 'x' } };
  assert.deepStrictEqual(validRecord(latest), { ...good, y: 'latest', v: { FRA: 1.5 }, ys: { FRA: 2022 } });
});

test('electoral votes: 538 in all, 51 places, the big states right', () => {
  assert.strictEqual(Object.keys(HOUSE_SEATS).length, 50);
  assert.strictEqual(
    Object.values(HOUSE_SEATS).reduce((a, b) => a + b, 0),
    435,
  );
  assert.strictEqual(Object.keys(ELECTORAL_VOTES).length, 51);
  assert.strictEqual(
    Object.values(ELECTORAL_VOTES).reduce((a, b) => a + b, 0),
    538,
  );
  assert.deepStrictEqual(
    [
      ELECTORAL_VOTES.California,
      ELECTORAL_VOTES.Texas,
      ELECTORAL_VOTES.Florida,
      ELECTORAL_VOTES.Wyoming,
      ELECTORAL_VOTES['District of Columbia'],
    ],
    [54, 40, 30, 3, 3],
  );
});

test('electoralName maps Natural Earth US units to states and DC', () => {
  assert.strictEqual(electoralName({ n: 'Washington', ty: 'State' }), 'Washington');
  assert.strictEqual(electoralName({ n: 'Washington', ty: 'Federal District' }), 'District of Columbia');
  assert.strictEqual(electoralName({ n: 'Rest of United States of America', ty: 'Not divided in the source data' }), '');
  assert.ok(ELECTORAL_VOTES[electoralName({ n: 'Washington', ty: 'State' })] === 12);
});

test('the seat table is the one verified against the Census table', async () => {
  // scripts/check_electoral.js compared these 50 numbers with Census Table 1 on 2026-10-14. Changing the table
  // changes this fingerprint: run that script, then update the fingerprint and the date in stat-us-electoral.json.
  const { createHash } = await import('node:crypto');
  const fp = createHash('sha256')
    .update(JSON.stringify(Object.entries(HOUSE_SEATS).sort(([a], [b]) => (a < b ? -1 : 1))))
    .digest('hex');
  assert.strictEqual(fp, '05b23c042782ac6a1d65126438342c23afc52f1a87ee86102ef22ec8c290e945');
  const src = statistics().find((s) => s.id === 'stat-us-electoral');
  assert.match(src.verified.sha256, /^[0-9a-f]{64}$/);
  assert.match(src.verified.years, /2024 and 2028/);
  assert.ok(!JSON.stringify(src).includes('2032 elections'));
});
