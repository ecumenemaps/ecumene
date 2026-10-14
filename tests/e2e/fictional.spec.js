// Fictional scenario: the Byzantium example says so in its exports, and nothing else does.
const { test, expect } = require('@playwright/test');
const { openApp, getCode, useCode } = require('./helpers');

test.describe.configure({ mode: 'serial' });

const NOTE = 'Fictional scenario: the regions, routes and events drawn on this map are invented';
const open = async (page, name) => {
  await page.goto('/app/index.html?example=' + name, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.ecumene && document.getElementById('load').hidden, null, { timeout: 120000 });
};

test('the Byzantium example is marked as fictional in the SVG description and the source line', async ({ page }) => {
  const errors = await openApp(page);
  await open(page, 'althist');
  const s = await page.evaluate(() => window.ecumene.getState());
  expect(s.fi).toBe(true);
  expect(s.lg.t).toContain('(fictional)');
  const svg = await page.evaluate(() => window.ecumene.svg());
  expect(svg).toContain(NOTE);
  expect(svg).toContain('not historical borders or events');
  expect(svg).toContain('<title>A restored Byzantium, 1453 (fictional)</title>');
  expect(svg).toContain('Fictional scenario ·'); // on the source line printed on the map
  // saved and restored with the map code
  const code = await getCode(page);
  await open(page, 'eu');
  await useCode(page, code);
  expect((await page.evaluate(() => window.ecumene.getState())).fi).toBe(true);
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

test('other maps are not marked, and the mark goes when the drawn regions are deleted', async ({ page }) => {
  const errors = await openApp(page);
  await open(page, 'eu');
  expect((await page.evaluate(() => window.ecumene.getState())).fi).toBeUndefined();
  expect(await page.evaluate(() => window.ecumene.svg())).not.toContain('Fictional scenario');
  // the example with its regions, routes and marker deleted is no longer a scenario of invented regions
  await open(page, 'althist');
  await page.evaluate(() => {
    const s = window.ecumene.getState();
    s.g = [];
    window.ecumene.setState(s);
  });
  const svg = await page.evaluate(() => window.ecumene.svg());
  expect(svg).not.toContain('Fictional scenario');
  expect(errors).toEqual([]);
});
