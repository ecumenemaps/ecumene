// Color by a statistic (Data panel). The World Bank API is answered from a fixture here, so these tests need no network.
const { test, expect } = require('@playwright/test');
const { openApp, status, getCode, useCode, mode } = require('./helpers');

test.describe.configure({ mode: 'serial' });

const row = (iso, date, value) => ({
  indicator: { id: 'NY.GDP.PCAP.CD' },
  country: { id: 'XX' },
  countryiso3code: iso,
  date: String(date),
  value,
});
// 2023 and 2022 cover the countries below; 2024 has only France, so it is not the default; Kenya has nothing after 2021
const ROWS = [];
for (const [iso, v] of [
  ['FRA', 44000],
  ['DEU', 52000],
  ['USA', 82000],
  ['BRA', 10000],
  ['IND', 2500],
  ['CHN', 12700],
  ['NGA', 800],
  ['XKX', 6000],
]) {
  ROWS.push(row(iso, 2023, v), row(iso, 2022, v * 0.95));
}
ROWS.push(row('FRA', 2024, 45000), row('KEN', 2021, 2100), row('WLD', 2023, 13000), row('EUU', 2023, 40000), row('DEU', 2024, null));
const reply = (rows) => [{ page: 1, pages: 1, per_page: 20000, total: rows.length, sourceid: '2', lastupdated: '2026-10-08' }, rows];

let hits;
async function mockWB(page, rows = ROWS) {
  hits = [];
  await page.route('https://api.worldbank.org/**', (route) => {
    hits.push(route.request().url());
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(reply(rows)),
    });
  });
}
const fills = (page) => page.evaluate(() => window.ecumene.getState().f);
const fillOf = async (page, name) => (await fills(page)).find((g) => g.n.includes(name));

test('GDP per capita: year choice, colors, legend title, No data entry and export credit', async ({ page }) => {
  await mockWB(page);
  const errors = await openApp(page);
  await mode(page, 'data');
  expect(hits).toEqual([]); // nothing is fetched until a statistic is chosen
  await expect(page.locator('#dstw')).toBeHidden();
  await expect(page.locator('#dndw')).toBeHidden();
  await page.selectOption('#dst', 'wb:NY.GDP.PCAP.CD');
  await expect(page.locator('#dyr')).toBeEnabled();
  expect(hits.length).toBe(1);
  expect(hits[0]).toContain('/indicator/NY.GDP.PCAP.CD?');
  // the default year is the latest with good coverage: 2024 has only France
  await expect(page.locator('#dyr option').first()).toHaveText('Latest with good coverage (2023)');
  await expect(page.locator('#dyr')).toHaveValue('auto');
  await page.click('#dgo');
  await expect(status(page)).toContainText('8 countries colored');
  const s = await page.evaluate(() => window.ecumene.getState());
  expect(s.lg.t).toBe('GDP per capita (current US$), 2023');
  // France and Kosovo are matched (Kosovo by name), and the high and low ends get different colors
  const c = async (n) => (await fillOf(page, n)).c;
  expect(await c('France')).toMatch(/^#/);
  expect(await c('Kosovo')).toMatch(/^#/);
  expect(await c('United States of America')).not.toBe(await c('Nigeria'));
  // places without a value are grey with fine dots and one "No data" legend entry, French Guiana included
  const nd = (await fills(page)).find((g) => g.c.startsWith('p:fine'));
  expect(nd.l).toBe('No data');
  expect(nd.n).toContain('French Guiana');
  expect(nd.n).toContain('Kenya'); // its only value is from 2021, outside the chosen year
  expect(nd.n).not.toContain('France');
  await mode(page, 'legend');
  await expect(page.locator('#lgd .lg input[type=text]').last()).toHaveValue('No data');
  // the export names the source, indicator code, year and licence
  const svg = await page.evaluate(() => window.ecumene.svg());
  expect(svg).toContain('World Bank, World Development Indicators, NY.GDP.PCAP.CD, 2023, CC BY 4.0');
  expect(svg).toContain('Fetched from the World Bank on ');
  // the numbers are saved with the map: reopening it from its code uses no network and changes nothing
  const code = await getCode(page);
  const saved = (await page.evaluate(() => window.ecumene.getState())).st;
  expect(saved.c).toBe('NY.GDP.PCAP.CD');
  expect(saved.y).toBe(2023);
  expect(saved.v.FRA).toBe(44000);
  expect(saved.v.WLD).toBeUndefined();
  await page.unroute('https://api.worldbank.org/**');
  await page.route('https://api.worldbank.org/**', (route) => route.abort());
  await page.reload();
  await page.waitForFunction(() => document.getElementById('load').hidden, null, { timeout: 120000 });
  await useCode(page, code);
  expect((await page.evaluate(() => window.ecumene.getState())).st).toEqual(saved);
  await mode(page, 'data');
  await expect(page.locator('#dst')).toHaveValue('wb:NY.GDP.PCAP.CD');
  await expect(page.locator('#dsti')).toContainText('Saved with this map');
  expect((await page.evaluate(() => window.ecumene.svg())).includes('NY.GDP.PCAP.CD, 2023')).toBe(true);
  expect(errors).toEqual([]);
});

test('no-data marking can be turned off; a chosen year and "most recent for each country" say so', async ({ page }) => {
  await mockWB(page);
  const errors = await openApp(page);
  await mode(page, 'data');
  await page.selectOption('#dst', 'wb:NY.GDP.PCAP.CD');
  await expect(page.locator('#dyr')).toBeEnabled();
  await page.uncheck('#dnd');
  await page.click('#dgo');
  await expect(status(page)).toContainText('8 countries colored');
  expect((await fills(page)).some((g) => g.c.startsWith('p:'))).toBe(false);
  expect(await fillOf(page, 'French Guiana')).toBeUndefined();
  // Kenya has only a 2021 value: it appears with each country's most recent value, and the legend and credit say so
  await page.selectOption('#dyr', 'latest');
  await page.click('#dgo');
  await expect(status(page)).toContainText('9 countries colored');
  const s = await page.evaluate(() => window.ecumene.getState());
  expect(s.lg.t).toBe('GDP per capita (current US$), most recent available, 2021–2024');
  expect(s.st.y).toBe('latest');
  expect(s.st.ys.KEN).toBe(2021);
  expect(await fillOf(page, 'Kenya')).toBeTruthy();
  const svg = await page.evaluate(() => window.ecumene.svg());
  expect(svg).toContain('most recent year per country (2021–2024)');
  // a specific year
  await page.selectOption('#dyr', '2022');
  await page.click('#dgo');
  expect((await page.evaluate(() => window.ecumene.getState())).lg.t).toBe('GDP per capita (current US$), 2022');
  // pasting your own rows afterwards drops the statistic and its credit
  await page.selectOption('#dst', '');
  await page.fill('#dd', 'France, 1\nGermany, 2');
  await page.click('#dgo');
  const s2 = await page.evaluate(() => window.ecumene.getState());
  expect(s2.st).toBeUndefined();
  expect(await page.evaluate(() => window.ecumene.svg())).not.toContain('NY.GDP.PCAP.CD');
  expect(errors).toEqual([]);
});

test('a failed fetch says so and leaves the map alone', async ({ page }) => {
  const errors = await openApp(page);
  await page.route('https://api.worldbank.org/**', (route) =>
    route.fulfill({ status: 503, body: 'down', headers: { 'access-control-allow-origin': '*' } }),
  );
  await mode(page, 'data');
  await page.selectOption('#dst', 'wb:SP.POP.TOTL');
  await expect(page.locator('#dsti')).toContainText('Could not load this statistic');
  await expect(page.locator('#dstr')).toBeEnabled();
  // fetch again works once the service is back
  await page.unroute('https://api.worldbank.org/**');
  await mockWB(
    page,
    ROWS.map((r) => ({ ...r, indicator: { id: 'SP.POP.TOTL' } })),
  );
  await page.click('#dstr');
  await expect(page.locator('#dyr option').first()).toContainText('Latest with good coverage');
  expect(await fills(page)).toEqual([]);
  expect(errors.filter((e) => !/503|Failed to load resource/.test(e))).toEqual([]);
});

test('electoral votes color the US states', async ({ page }) => {
  const errors = await openApp(page);
  await mode(page, 'data');
  await page.selectOption('#dst', 'ev');
  await expect(page.locator('#dsti')).toContainText('2020 Census apportionment');
  await page.click('#dgo');
  await expect(status(page)).toContainText('51 states (with DC) colored', { timeout: 120000 });
  const s = await page.evaluate(() => window.ecumene.getState());
  expect(s.lg.t).toBe('Electoral votes per state, 2024, 2028 and 2032 elections');
  expect(s.st).toEqual({ k: 'ev' });
  const us = s.u.flatMap((g) => g.k['United States of America'] || []);
  expect(us.length).toBe(51);
  expect(us).toContain('USA-3556'); // the District of Columbia
  expect(s.f).toEqual([]);
  // the states fall into several classes, each a legend entry with its range; DC (3 votes) is in the lowest
  expect(s.u.length).toBeGreaterThan(2);
  for (const g of s.u) expect(g.l).toMatch(/ to /);
  const lowest = s.u.reduce((a, g) => (parseFloat(g.l) < parseFloat(a.l) ? g : a));
  expect(lowest.k['United States of America']).toContain('USA-3556');
  const svg = await page.evaluate(() => window.ecumene.svg());
  expect(svg).toContain('U.S. Census Bureau 2020 apportionment');
  expect(errors).toEqual([]);
});
