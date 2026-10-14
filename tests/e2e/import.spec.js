// Your own data (#14): paste a table, open a CSV or XLSX file, load a Google Sheets link; the preview, the colors,
// the credit in exports and the table saved with the map. Google is answered from a fixture, so no network is needed.
const { test, expect } = require('@playwright/test');
const zlib = require('zlib');
const { openApp, status, getCode, useCode, mode, sourceNote } = require('./helpers');

test.describe.configure({ mode: 'serial' });

const state = (page) => page.evaluate(() => window.ecumene.getState());
const fillOf = async (page, n) => (await state(page)).f.find((g) => g.n.includes(n));

// ---- a minimal .xlsx (zip of XML parts, deflated like a real one)
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b) => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function zip(files) {
  const locals = [],
    centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, 'utf8'),
      data = zlib.deflateRawSync(raw),
      nm = Buffer.from(name, 'utf8'),
      crc = crc32(raw);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nm.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(nm.length, 28);
    ch.writeUInt32LE(offset, 42);
    locals.push(lh, nm, data);
    centrals.push(ch, nm);
    offset += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(centrals),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const col = (i) => String.fromCharCode(65 + i);
function xlsx(sheets) {
  const files = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'xl/workbook.xml':
      '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets.map((s, i) => '<sheet name="' + esc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') +
      '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets
        .map((s, i) => '<Relationship Id="rId' + (i + 1) + '" Type="worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>')
        .join('') +
      '</Relationships>',
  };
  sheets.forEach((s, i) => {
    files['xl/worksheets/sheet' + (i + 1) + '.xml'] =
      '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
      s.rows
        .map(
          (r, y) =>
            '<row r="' +
            (y + 1) +
            '">' +
            r
              .map((v, x) =>
                typeof v === 'number'
                  ? '<c r="' + col(x) + (y + 1) + '"><v>' + v + '</v></c>'
                  : '<c r="' + col(x) + (y + 1) + '" t="inlineStr"><is><t>' + esc(v) + '</t></is></c>',
              )
              .join('') +
            '</row>',
        )
        .join('') +
      '</sheetData></worksheet>';
  });
  return zip(files);
}

test('a pasted spreadsheet table: header, latest column, did-you-mean, legend title and No data', async ({ page }) => {
  const errors = await openApp(page);
  await mode(page, 'data');
  await page.fill(
    '#dd',
    'Country\tCode\t2022\t2023\nFrance\tFRA\t40886\t44461\nGermany\tDEU\t48718\t52746\nKenya\tKEN\t2099\t1950\nPeru\tPER\t7126\t7789\nFrnace\tXXX\t1\t2',
  );
  // the preview guesses the header, the column of places and the latest year
  await expect(page.locator('#dpv')).toBeVisible();
  await expect(page.locator('#dhd')).toBeChecked();
  await expect(page.locator('#dvc option:checked')).toHaveText('2023');
  await expect(page.locator('#dpi')).toContainText('Frnace (did you mean France?)');
  await page.click('#dgo');
  await expect(status(page)).toContainText('4 countries colored');
  const s = await state(page);
  expect(s.lg.t).toBe('2023');
  expect(s.im.src).toBe('paste');
  expect(s.im.head).toEqual(['Country', '2023']);
  expect((await fillOf(page, 'Kenya')).c).not.toBe((await fillOf(page, 'Germany')).c);
  expect((await fillOf(page, 'Brazil')).l).toBe('No data');
  // no source given: exports say so plainly
  const svg = await page.evaluate(() => window.ecumene.svg());
  expect(sourceNote(svg)).toContain("data: supplied by the map's author, not checked by Ecumene");
  expect(svg).toContain('No source was given');
  // choosing the other year colours by it
  await page.selectOption('#dvc', { label: '2022' });
  await page.click('#dgo');
  expect((await state(page)).lg.t).toBe('2022');
  expect(errors).toEqual([]);
});

test('categories and colors, places given as ISO codes', async ({ page }) => {
  const errors = await openApp(page);
  await mode(page, 'data');
  await page.fill('#dd', 'Country,Status\nFrance,Member\nNorway,Partner\nSwitzerland,Partner\nIceland,Partner');
  await page.click('#dgo');
  await expect(status(page)).toContainText('4 countries colored in 2 categories');
  const f = await state(page);
  const member = f.f.find((g) => g.n.includes('France')),
    partner = f.f.find((g) => g.n.includes('Norway'));
  expect(member.l).toBe('Member');
  expect(partner.l).toBe('Partner');
  expect(partner.n).toEqual(expect.arrayContaining(['Switzerland', 'Iceland']));
  // a column of colors is used as it is; places by alpha-3 and alpha-2 codes
  await page.fill('#dd', 'FRA;#112233\nDE;#445566\nkey;#778899');
  await page.click('#dgo');
  expect((await fillOf(page, 'France')).c).toBe('#112233');
  expect((await fillOf(page, 'Germany')).c).toBe('#445566');
  await expect(status(page)).toContainText('Not recognised: key');
  expect(errors).toEqual([]);
});

test('a CSV file with a source, and an XLSX file with two sheets', async ({ page }) => {
  const errors = await openApp(page);
  await mode(page, 'data');
  await page.setInputFiles('#dfi', {
    name: 'turnout.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('name;turnout\n"France";"68,5"\n"Germany";"76,4"\n"Italy";"63,9"\n', 'utf8'),
  });
  await expect(page.locator('#dpi')).toContainText('From turnout.csv');
  await page.fill('#dsrc', 'National election offices, 2024');
  await page.click('#dgo');
  await expect(status(page)).toContainText('3 countries colored');
  const s = await state(page);
  expect(s.im).toMatchObject({ src: 'file', name: 'turnout.csv', credit: 'National election offices, 2024' });
  expect(s.im.rows[0]).toEqual(['France', '68,5']);
  expect(s.lg.t).toBe('turnout');
  const svg = await page.evaluate(() => window.ecumene.svg());
  expect(sourceNote(svg)).toContain('data: National election offices, 2024');
  expect(svg).toContain('the file turnout.csv');
  expect(svg).toContain('Not checked by Ecumene');
  // an .xlsx file: its sheets in a menu, numbers and text read
  const book = xlsx([
    { name: 'Notes', rows: [['Made for a test']] },
    {
      name: 'Data',
      rows: [
        ['Country', 'Score'],
        ['Spain', 7.5],
        ['Portugal', 6],
        ['Greece', 4.25],
      ],
    },
  ]);
  await page.setInputFiles('#dfi', {
    name: 'scores.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: book,
  });
  await expect(page.locator('#dsh')).toBeVisible();
  await page.selectOption('#dsh', { label: 'Sheet: Data' });
  await expect(page.locator('#dvc option:checked')).toHaveText('Score');
  await page.click('#dgo');
  await expect(status(page)).toContainText('3 countries colored');
  expect((await state(page)).im).toMatchObject({ src: 'file', name: 'scores.xlsx' });
  expect(errors).toEqual([]);
});

test('a Google Sheets link: read from Google once, saved with the map, failure explained', async ({ page }) => {
  const hits = [];
  await page.route('https://docs.google.com/**', (route) => {
    hits.push(route.request().url());
    route.fulfill({
      status: 200,
      contentType: 'text/csv',
      headers: { 'access-control-allow-origin': '*' },
      body: 'Country,Seats\nSweden,349\nNorway,169\nDenmark,179\n',
    });
  });
  const errors = await openApp(page);
  await mode(page, 'data');
  expect(hits).toEqual([]);
  await page.fill('#dsu', 'https://docs.google.com/spreadsheets/d/1AbC-d_9/edit#gid=5');
  await page.click('#dsl');
  await expect(page.locator('#dpi')).toContainText('From the Google Sheet');
  expect(hits).toEqual(['https://docs.google.com/spreadsheets/d/1AbC-d_9/export?format=csv&gid=5']);
  await page.click('#dgo');
  await expect(status(page)).toContainText('3 countries colored');
  const saved = (await state(page)).im;
  expect(saved).toMatchObject({
    src: 'sheet',
    url: 'https://docs.google.com/spreadsheets/d/1AbC-d_9/edit#gid=5',
    rows: [
      ['Sweden', '349'],
      ['Norway', '169'],
      ['Denmark', '179'],
    ],
  });
  expect(await page.evaluate(() => window.ecumene.svg())).toContain(
    'a Google Sheets link (https://docs.google.com/spreadsheets/d/1AbC-d_9/edit#gid=5), read on',
  );
  // reopening the map uses the saved rows: nothing is read from Google again
  const code = await getCode(page);
  await page.reload();
  await page.waitForFunction(() => document.getElementById('load').hidden, null, { timeout: 120000 });
  await useCode(page, code);
  expect((await state(page)).im).toEqual(saved);
  expect(hits.length).toBe(1);
  await mode(page, 'data');
  await expect(page.locator('#dsu')).toHaveValue('https://docs.google.com/spreadsheets/d/1AbC-d_9/edit#gid=5');
  await expect(page.locator('#dvc option:checked')).toHaveText('Seats');
  // a sheet that is not shared answers with a sign-in page
  await page.unroute('https://docs.google.com/**');
  await page.route('https://docs.google.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', headers: { 'access-control-allow-origin': '*' }, body: '<html>Sign in</html>' }),
  );
  await page.click('#dsl');
  await expect(status(page)).toContainText('Share it as');
  await page.fill('#dsu', 'https://example.com/sheet');
  await page.click('#dsl');
  await expect(status(page)).toContainText('not a Google Sheets link');
  expect(errors).toEqual([]);
});
