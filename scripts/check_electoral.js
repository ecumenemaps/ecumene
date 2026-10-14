// Checks HOUSE_SEATS in src/js/stats.js (the seats behind the electoral votes) against the U.S. Census Bureau's
// 2020 apportionment, Table 1 "Apportionment population and number of representatives by state: 2020 census".
// Usage: node scripts/check_electoral.js [path to apportionment-2020-table01.xlsx]   (downloads it when no path is given)
// Prints the file's SHA-256 (recorded in scripts/sources/stat-us-electoral.json) and every difference; exits 1 on any.
// Not part of CI (it needs the network); run it when a new apportionment is published.
const fs = require('fs'),
  crypto = require('crypto');
const { zipEntries } = require('./lib/unzip.js');
const URL = 'https://www2.census.gov/programs-surveys/decennial/2020/data/apportionment/apportionment-2020-table01.xlsx';

/** Rows of the first worksheet as arrays of cell text. */
function readRows(buf) {
  const E = zipEntries(buf),
    ss = E.find((e) => e.name === 'xl/sharedStrings.xml'),
    text = (s) =>
      s
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
  const strs = ss
    ? [
        ...ss
          .data()
          .toString('utf8')
          .matchAll(/<si>([\s\S]*?)<\/si>/g),
      ].map((m) => text([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('')))
    : [];
  const sheet = E.find((e) => e.name === 'xl/worksheets/sheet1.xml')
    .data()
    .toString('utf8');
  return [...sheet.matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)].map((r) =>
    [...r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map((c) => {
      const t = /t="(\w+)"/.exec(c[1]),
        v = /<v>([\s\S]*?)<\/v>/.exec(c[2] || '');
      return v ? (t && t[1] === 's' ? strs[+v[1]] : v[1]) : '';
    }),
  );
}

(async () => {
  const buf = process.argv[2] ? fs.readFileSync(process.argv[2]) : Buffer.from(await (await fetch(URL)).arrayBuffer());
  console.log('Census Table 1: ' + buf.length + ' bytes, SHA-256 ' + crypto.createHash('sha256').update(buf).digest('hex'));
  const census = {};
  let printedTotal = null;
  for (const r of readRows(buf)) {
    if (!r[0] || !/^\d+$/.test(r[2] || '') || !/^\d+$/.test(r[1] || '')) continue;
    if (/^TOTAL/i.test(r[0].trim())) printedTotal = +r[2];
    else census[r[0].trim()] = +r[2];
  }
  const { HOUSE_SEATS } = await import('../src/js/stats.js');
  const bad = [];
  for (const s of new Set([...Object.keys(census), ...Object.keys(HOUSE_SEATS)]))
    if (census[s] !== HOUSE_SEATS[s]) bad.push(s + ': Census ' + census[s] + ', ours ' + HOUSE_SEATS[s]);
  const total = Object.values(census).reduce((a, b) => a + b, 0);
  console.log(
    Object.keys(census).length +
      ' states in the Census table, ' +
      total +
      ' representatives (the table prints ' +
      printedTotal +
      '); ' +
      Object.keys(HOUSE_SEATS).length +
      ' in stats.js',
  );
  if (total !== printedTotal) bad.push('the states add up to ' + total + ' but the table prints ' + printedTotal);
  if (bad.length) {
    console.log('DIFFERENCES:\n' + bad.join('\n'));
    process.exit(1);
  }
  console.log('All seat numbers match the Census table.');
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
