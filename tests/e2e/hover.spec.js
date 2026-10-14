// The hover tag's second line: what the map says about the place under the pointer (a statistic's value, the color's
// legend name, the seats of a state on an election map).
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test.describe.configure({ mode: 'serial' });

// move the pointer to a lon/lat, then nudge it (the tag follows pointer moves)
async function rest(page, lon, lat) {
  const box = await page.locator('#cv').boundingBox(),
    p = await page.evaluate((g) => window.ecumene.px(g), [lon, lat]);
  await page.mouse.move(box.x + p[0], box.y + p[1]);
  await page.mouse.move(box.x + p[0] + 1, box.y + p[1] + 1);
}
const name = (page) => page.locator('#tip').evaluate((t) => t.firstChild.textContent);
const info = (page) => page.locator('#tip .ti');

test('countries: the color label, and a statistic with its year', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    const s = window.ecumene.getState();
    Object.assign(s, { r: [-1, -44], z: 4, f: [{ c: '#2166ac', n: ['France'], l: 'Founders' }], u: [] });
    window.ecumene.setState(s);
  });
  await rest(page, 2.4, 46.6);
  await expect(info(page)).toHaveText('Founders');
  expect(await name(page)).toBe('France');
  await expect(page.locator('#sr')).toHaveText('France. Founders');
  // an unpainted country has no second line
  await rest(page, -3.7, 40.3);
  expect(await name(page)).toBe('Spain');
  await expect(info(page)).toHaveCount(0);
  // a map colored by a statistic: the value and its year, or no data
  await page.evaluate(() => {
    const s = window.ecumene.getState();
    s.st = { k: 'wb', c: 'SP.POP.TOTL', y: 2023, t: '2026-10-01', v: { FRA: 68170228 } };
    window.ecumene.setState(s);
  });
  await rest(page, 2.4, 46.7);
  await expect(info(page)).toHaveText('Population: 68,170,228 (2023)');
  await rest(page, -3.7, 40.4);
  await expect(info(page)).toHaveText('No data');
  expect(errors).toEqual([]);
});

test('US states on an election map: the party and electoral votes, without Subdivisions mode', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(async () => {
    const t = await (await fetch('admin1/USA.json')).json();
    const ca = t.objects.u.geometries.find((g) => g.properties.n === 'California' && g.properties.ty === 'State').properties.c;
    const s = window.ecumene.getState();
    Object.assign(s, { r: [115, -38], z: 4, f: [], u: [{ c: '#2166ac', k: { 'United States of America': [ca] }, l: 'Democratic' }] });
    window.ecumene.setState(s);
  });
  await page.waitForFunction(() => !!window.ecumene.seats(), null, { timeout: 60000 });
  await rest(page, -119.6, 37.2);
  await expect(info(page)).toHaveText('Democratic · 54 electoral votes');
  expect(await name(page)).toBe('California');
  // moving within the country to an unpainted state updates the tag
  await rest(page, -116.8, 39.3);
  await expect(info(page)).toHaveText('6 electoral votes');
  expect(await name(page)).toBe('Nevada');
  expect(errors).toEqual([]);
});
