// Fictional scenario: the Legend panel's checkbox, what exports say, and the Byzantium example.
const { test, expect } = require('@playwright/test');
const { openApp, getCode, useCode, mode } = require('./helpers');

test.describe.configure({ mode: 'serial' });

const NOTE = 'Fictional scenario: the regions, routes and events drawn on this map are invented';

test('the Legend checkbox marks the SVG description and the source line, and survives a map code', async ({ page }) => {
  const errors = await openApp(page);
  await mode(page, 'legend');
  await expect(page.locator('#fic')).not.toBeChecked();
  let svg = await page.evaluate(() => window.ecumene.svg());
  expect(svg).not.toContain('Fictional scenario');
  expect((await page.evaluate(() => window.ecumene.getState())).fi).toBeUndefined();
  await page.check('#fic');
  svg = await page.evaluate(() => window.ecumene.svg());
  expect(svg).toContain(NOTE);
  expect(svg).toContain('not historical borders or events');
  expect(svg).toContain('Fictional scenario ·'); // on the source line printed on the map
  expect((await page.evaluate(() => window.ecumene.getState())).fi).toBe(true);
  // saved and restored with the map
  const code = await getCode(page);
  await mode(page, 'legend');
  await page.uncheck('#fic');
  expect((await page.evaluate(() => window.ecumene.getState())).fi).toBeUndefined();
  await useCode(page, code);
  await mode(page, 'legend');
  await expect(page.locator('#fic')).toBeChecked();
  expect(await page.evaluate(() => window.ecumene.svg())).toContain(NOTE);
  // with the source note switched off the SVG description still carries it
  await page.evaluate(() => {
    const s = window.ecumene.getState();
    s.lg.n = false;
    window.ecumene.setState(s);
  });
  const quiet = await page.evaluate(() => window.ecumene.svg());
  expect(quiet).toContain(NOTE);
  expect(quiet).not.toContain('Fictional scenario ·');
  expect(errors).toEqual([]);
});

test('the Byzantium example is marked as fictional and a map without the mark is not', async ({ page }) => {
  const errors = await openApp(page);
  await page.goto('/app/index.html?example=althist', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.ecumene && document.getElementById('load').hidden, null, { timeout: 120000 });
  const s = await page.evaluate(() => window.ecumene.getState());
  expect(s.fi).toBe(true);
  expect(s.lg.t).toContain('(fictional)');
  const svg = await page.evaluate(() => window.ecumene.svg());
  expect(svg).toContain(NOTE);
  expect(svg).toContain('<title>A restored Byzantium, 1453 (fictional)</title>');
  // another example is not
  await page.goto('/app/index.html?example=eu', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.ecumene && document.getElementById('load').hidden, null, { timeout: 120000 });
  expect((await page.evaluate(() => window.ecumene.getState())).fi).toBeUndefined();
  expect(await page.evaluate(() => window.ecumene.svg())).not.toContain('Fictional scenario');
  expect(errors).toEqual([]);
});
