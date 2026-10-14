// Your own data (src/js/table.js): reading tables, numbers, columns, places, Google Sheets links and .xlsx files.
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
import {
  parseText,
  parseNumber,
  parseColour,
  valueKind,
  placeMatcher,
  suggest,
  guessColumns,
  columnNames,
  sheetsCsvUrl,
  readXlsx,
  importRecord,
  validImport,
  importCredit,
} from '../../src/js/table.js';

const require = createRequire(import.meta.url);
const Ecu = require('../../src/groups.js');
const world = require('../../src/overseas.js').splitOverseas(require('world-atlas/countries-10m.json'), feature);
const feats = feature(world, world.objects.countries).features.filter((f) => f.properties && f.properties.name);
const names = [...new Set(feats.map((f) => f.properties.name))];
const match = placeMatcher(feats, Ecu.matcher(names));

test('delimiters: tab-separated paste with a header, semicolons with decimal commas, quoted CSV', () => {
  assert.deepStrictEqual(parseText('Country\tCode\t2022\t2023\nFrance\tFRA\t40,886\t44,461\nKenya\tKEN\t2,099\t1,950').rows, [
    ['Country', 'Code', '2022', '2023'],
    ['France', 'FRA', '40,886', '44,461'],
    ['Kenya', 'KEN', '2,099', '1,950'],
  ]);
  assert.strictEqual(parseText('Land;Wert\nDeutschland;3,5\nÖsterreich;2,1').delim, ';');
  const q = parseText('name,value,note\n"Korea, South",51.7,"said ""hello"""\n"Côte d\'Ivoire","1,234.5",x\n');
  assert.deepStrictEqual(q.rows[1], ['Korea, South', '51.7', 'said "hello"']);
  assert.deepStrictEqual(q.rows[2], ["Côte d'Ivoire", '1,234.5', 'x']);
  // the paste box's old forms still work
  assert.deepStrictEqual(parseText('France, 68\nItaly: 12%\nPeru = 3').rows, [['France', '68'], ['Italy', '12%'], ['Peru', '3']]);
  assert.deepStrictEqual(parseText('Italy: 12%\nPeru = 3,5').rows, [['Italy', '12%'], ['Peru', '3,5']]);
  assert.strictEqual(parseText('').rows.length, 0);
});

test('numbers in either decimal style, percents and minus signs', () => {
  const cases = { '68': 68, '1,234': 1234, '1,234.5': 1234.5, '1.234,5': 1234.5, '1.234.567': 1234567, '3,5': 3.5, '12%': 12, '−3': -3, '-0.5': -0.5, ' 40 886 ': 40886, '.5': 0.5 };
  for (const [s, v] of Object.entries(cases)) assert.strictEqual(parseNumber(s), v, s);
  for (const s of ['', 'n/a', '..', 'abc', '12 kg', '#e4572e']) assert.ok(Number.isNaN(parseNumber(s)), s);
});

test('a value column holds numbers, colours or categories', () => {
  assert.strictEqual(valueKind(['1', '2,5', '', '3%']), 'number');
  assert.strictEqual(valueKind(['#E4572E', '#fff', '#2a9d8f']), 'colour');
  assert.strictEqual(valueKind(['Member', 'Observer', 'Member', '3']), 'category');
  assert.strictEqual(parseColour('#ABC'), '#aabbcc');
  assert.strictEqual(parseColour('red'), '');
});

test('places by name, alias, ISO alpha-3 or alpha-2 code', () => {
  const cases = { France: 'France', 'united states': 'United States of America', FRA: 'France', fra: 'France', FR: 'France', GB: 'United Kingdom', GBR: 'United Kingdom', XK: 'Kosovo', XKX: 'Kosovo', GF: 'French Guiana', NA: 'Namibia', CIV: "Côte d'Ivoire", 'Ivory Coast': "Côte d'Ivoire" };
  for (const [t, n] of Object.entries(cases)) assert.strictEqual(match(t), n, t);
  for (const t of ['', 'Atlantis', 'ZZ', 'ZZZ', 'Europe']) assert.strictEqual(match(t), null, t);
  assert.strictEqual(suggest('Frnace', names, Ecu.norm), 'France');
  assert.strictEqual(suggest('Germny', names, Ecu.norm), 'Germany');
  assert.strictEqual(suggest('Atlantis', names, Ecu.norm), '');
});

test('guessing the columns: places, the latest numeric column, the header row', () => {
  const t = parseText('Country\tCode\t2022\t2023\nFrance\tFRA\t40886\t44461\nKenya\tKEN\t2099\t1950\nPeru\tPER\t7126\t7789').rows;
  assert.deepStrictEqual(guessColumns(t, match), { header: true, place: 0, value: 3 });
  assert.deepStrictEqual(columnNames(t, true), ['Country', 'Code', '2022', '2023']);
  assert.deepStrictEqual(columnNames(t, false).slice(0, 2), ['Column A', 'Column B']);
  // codes in the second column, no header
  const u = parseText('x1,DEU,83\nx2,FRA,68\nx3,ITA,59').rows;
  assert.deepStrictEqual(guessColumns(u, match), { header: false, place: 1, value: 2 });
  // categories: the value column is the first other column with text
  const c = parseText('Country,Status\nFrance,Member\nNorway,Partner\nSwitzerland,Partner').rows;
  assert.deepStrictEqual(guessColumns(c, match), { header: true, place: 0, value: 1 });
});

test('Google Sheets links become their CSV address, keeping the tab', () => {
  assert.strictEqual(sheetsCsvUrl('https://docs.google.com/spreadsheets/d/1AbC-d_9/edit#gid=123'), 'https://docs.google.com/spreadsheets/d/1AbC-d_9/export?format=csv&gid=123');
  assert.strictEqual(sheetsCsvUrl('https://docs.google.com/spreadsheets/d/1AbC-d_9/edit?usp=sharing'), 'https://docs.google.com/spreadsheets/d/1AbC-d_9/export?format=csv&gid=0');
  assert.strictEqual(sheetsCsvUrl('https://docs.google.com/spreadsheets/d/e/2PACX-1vX/pubhtml?gid=7&single=true'), 'https://docs.google.com/spreadsheets/d/e/2PACX-1vX/pub?output=csv&gid=7');
  for (const s of ['', 'not a link', 'https://example.com/spreadsheets/d/x/edit', 'https://docs.google.com/document/d/x/edit']) assert.strictEqual(sheetsCsvUrl(s), '', s);
});

test('reading a real .xlsx file (Census Bureau, 2020 apportionment, Table 1)', async () => {
  const sheets = await readXlsx(readFileSync(new URL('../fixtures/census-apportionment-2020-table01.xlsx', import.meta.url)));
  assert.strictEqual(sheets.length, 1);
  const rows = sheets[0].rows;
  const ca = rows.find((r) => r[0] === 'California');
  assert.deepStrictEqual(ca.slice(0, 3), ['California', '39576757', '52']);
  assert.ok(rows.some((r) => r[0] === 'Wyoming' && r[2] === '1'));
  await assert.rejects(readXlsx(new Uint8Array([1, 2, 3])), /not an \.xlsx/);
});

test('the record saved with a map, its checks and its credit', () => {
  const rows = parseText('Country,Score\nFrance,3\nKenya,5\n,').rows;
  const r = importRecord('sheet', { t: '2026-10-14', url: 'https://docs.google.com/spreadsheets/d/abc/edit' }, rows, { place: 0, value: 1 }, true, ' Eurostat, 2024 ');
  assert.deepStrictEqual(r.rows, [['France', '3'], ['Kenya', '5']]);
  assert.deepStrictEqual(r.head, ['Country', 'Score']);
  assert.strictEqual(r.credit, 'Eurostat, 2024');
  assert.deepStrictEqual(validImport(r), r);
  assert.strictEqual(validImport({ ...r, src: 'web' }), null);
  assert.strictEqual(validImport({ ...r, t: 'today' }), null);
  assert.strictEqual(validImport({ ...r, url: 'https://evil.example/x' }).url, undefined);
  const c = importCredit(r);
  assert.strictEqual(c.short, 'Eurostat, 2024');
  assert.ok(c.detail.includes('Source given by the map’s author: Eurostat, 2024. Not checked by Ecumene.'));
  const anon = importCredit({ ...r, credit: '', src: 'paste' });
  assert.strictEqual(anon.short, "supplied by the map's author, not checked by Ecumene");
  assert.ok(anon.detail.includes('No source was given'));
});
