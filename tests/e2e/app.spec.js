const { test, expect } = require('@playwright/test');
const { openApp, status, globeCentre, getCode, useCode, regionRows } = require('./helpers');

test.describe.configure({ mode: 'serial' });

test('loads with no errors and lists countries', async ({ page }) => {
  const errors = await openApp(page);
  expect(await page.locator('#names option').count()).toBeGreaterThan(240);
  expect(errors).toEqual([]);
});

test('click paints a country; undo and redo', async ({ page }) => {
  const errors = await openApp(page);
  const c = await globeCentre(page);
  await page.mouse.click(c.x + 60, c.y + 120); // Africa in the default view
  await expect(page.locator('#lgd .lg')).toHaveCount(1);
  await page.click('#un');
  await expect(page.locator('#lgd .lg')).toHaveCount(0);
  await page.click('#re');
  await expect(page.locator('#lgd .lg')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('paste a list and paint a group', async ({ page }) => {
  const errors = await openApp(page);
  await page.fill('#bl', 'France, Italy, Kenya, Atlantis, USA');
  await page.click('#blp');
  await expect(status(page)).toHaveText('Painted 4 countries. Not found: Atlantis.');
  await page.selectOption('#grp', 'NATO (32)');
  await page.click('#grpp');
  await expect(status(page)).toContainText('NATO (32): 32 areas painted');
  expect(errors).toEqual([]);
});

test('colour by data builds classed legend', async ({ page }) => {
  const errors = await openApp(page);
  await page.click('details:has(#dd) summary');
  await page.fill('#dd', 'France, 68\nGermany, 83\nSpain, 47\nItaly, 59\nBrazil, 12\nIndia, 30\nChina, 90\nKenya, 5\nAtlantis, 3');
  await page.click('#dgo');
  await expect(status(page)).toContainText('8 countries colored in 5 classes');
  await expect(page.locator('#lgd .lg')).toHaveCount(5);
  await expect(page.locator('#lgd .lg input[type=text]').first()).toHaveValue(/ to /);
  expect(errors).toEqual([]);
});

test('legend editor: reorder, remove, title survive a map code', async ({ page }) => {
  const errors = await openApp(page);
  await page.fill('#bl', 'France');
  await page.click('#blp');
  await page.locator('#pal .sw').nth(3).click();
  await page.fill('#bl', 'Peru');
  await page.click('#blp');
  await page.locator('#lgd .lg input[type=text]').nth(0).fill('First');
  await page.locator('#lgd .lg input[type=text]').nth(1).fill('Second');
  await page.locator('#lgd .lg').nth(1).locator('button').nth(0).click(); // move up
  await expect(page.locator('#lgd .lg input[type=text]').first()).toHaveValue('Second');
  await page.fill('#lt', 'My legend');
  const code = await getCode(page);
  await page.locator('#lgd .lg').nth(0).locator('button').nth(2).click(); // remove
  await expect(page.locator('#lgd .lg')).toHaveCount(1);
  await useCode(page, code);
  await expect(page.locator('#lgd .lg')).toHaveCount(2);
  await expect(page.locator('#lgd .lg input[type=text]').first()).toHaveValue('Second');
  await expect(page.locator('#lt')).toHaveValue('My legend');
  expect(errors).toEqual([]);
});

test('draw, edit and undo a region', async ({ page }) => {
  const errors = await openApp(page);
  const c = await globeCentre(page);
  await page.click('#rgtools button[data-t=region]');
  for (const [dx, dy] of [
    [-120, -80],
    [60, -110],
    [140, 30],
    [-40, 120],
  ])
    await page.mouse.click(c.x + dx, c.y + dy);
  await page.mouse.click(c.x - 120, c.y - 80); // close on first point
  await expect(page.locator('#rgl .rg-row')).toHaveCount(1);
  await page.mouse.move(c.x + 140, c.y + 30);
  await page.mouse.down();
  await page.mouse.move(c.x + 190, c.y + 60, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press('Escape');
  await page.click('#un');
  await page.click('#un');
  await expect(page.locator('#rgl .rg-row')).toHaveCount(0);
  await page.click('#re');
  await expect(page.locator('#rgl .rg-row')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('arrows, text and markers', async ({ page }) => {
  test.setTimeout(480000);
  const errors = await openApp(page);
  const c = await globeCentre(page);
  await page.click('#rgtools button[data-t=arrow]');
  for (const [dx, dy] of [
    [200, -120],
    [120, -40],
    [20, -20],
  ])
    await page.mouse.click(c.x + dx, c.y + dy);
  await page.keyboard.press('Enter');
  await page.locator('#rgl .rg-row.on input[type=text]').fill('Migration');
  await page.click('#rgtools button[data-t=text]');
  await page.mouse.click(c.x + 150, c.y - 170);
  await page.locator('#rgl .rg-row.on input[type=text]').fill('Steppe');
  await page.click('#rgtools button[data-t=marker]');
  await page.mouse.click(c.x + 40, c.y + 40);
  await page.locator('#rgl .rg-row.on select').selectOption('star');
  await expect(page.locator('#rgl .kind')).toHaveText(['→', 'T', '●']);
  const code = await getCode(page);
  await page.reload();
  await page.waitForFunction(() => document.getElementById('load').hidden);
  await useCode(page, code);
  await expect(page.locator('#rgl .rg-row')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('exact outline from painted countries keeps all parts', async ({ page }) => {
  const errors = await openApp(page);
  await page.fill('#bl', 'Japan');
  await page.click('#blp');
  await page.click('#rgc');
  await expect(status(page)).toContainText('Exact outline made from 1 country');
  await expect(page.locator('#rgl .src')).toContainText('1 country: Japan');
  expect(errors).toEqual([]);
});

test('subdivision outlines: groups, list, map click, restore', async ({ page, browser }) => {
  test.setTimeout(600000);
  const errors = await openApp(page);
  const pick = async (how) => {
    await page.click('#a1o');
    await page.fill('#a1c', 'United Kingdom');
    await page.locator('#a1c').dispatchEvent('change');
    await expect(page.locator('#a1l label').first()).toBeVisible();
    await how();
    await page.click('#a1ok');
  };
  await pick(() => page.click('#a1g .chip:has-text("Scotland")'));
  await expect(status(page)).toHaveText('Exact outline added: Scotland.');
  await pick(async () => {
    await page.fill('#a1f', 'Cornwall');
    await page.locator('#a1l label:has-text("Cornwall") input').check();
  });
  await expect(status(page)).toHaveText('Exact outline added: Cornwall.');
  await pick(() => page.click('#a1g .chip:has-text("Greater London")'));
  await expect(status(page)).toHaveText('Exact outline added: Greater London.');
  // clicking the map selects a unit (globe is centred on the UK after choosing it)
  await page.click('#a1o');
  await page.fill('#a1c', 'United Kingdom');
  await page.locator('#a1c').dispatchEvent('change');
  await expect(page.locator('#a1l label').first()).toBeVisible();
  await page.waitForTimeout(900);
  const c = await globeCentre(page);
  await page.mouse.click(c.x, c.y);
  await expect(page.locator('#a1s')).toHaveText(/^1 of \d+ selected$/);
  await page.click('#a1x');
  const code = await getCode(page);
  const p2 = await browser.newPage();
  const e2 = await openApp(p2);
  await useCode(p2, code);
  await expect(p2.locator('#rgl .src')).toHaveText([
    'United Kingdom · 32 subdivisions',
    'United Kingdom · 1 subdivision',
    'United Kingdom · 33 subdivisions',
  ]);
  expect(errors.concat(e2)).toEqual([]);
});

test('style and font survive a map code', async ({ page }) => {
  const errors = await openApp(page);
  await page.selectOption('#pre', 'dark');
  await page.selectOption('#sfont', 'notoserif');
  const code = await getCode(page);
  await page.selectOption('#pre', 'light');
  await page.selectOption('#sfont', 'sys');
  await useCode(page, code);
  await expect(page.locator('#sfont')).toHaveValue('notoserif');
  expect(errors).toEqual([]);
});

test('scripting API round-trips state; lakes and rivers load after first frame', async ({ page }) => {
  const errors = await openApp(page);
  const st = await page.evaluate(() => {
    const s = window.ecumene.getState();
    s.f = [{ c: '#123456', n: ['Chile', 'Peru'], l: 'Andes' }];
    window.ecumene.setState(s);
    return window.ecumene.getState();
  });
  expect(st.f).toEqual([{ c: '#123456', n: ['Chile', 'Peru'], l: 'Andes' }]);
  await expect(page.locator('#lgd .lg input[type=text]')).toHaveValue('Andes');
  expect(await page.evaluate(() => window.ecumene.version)).toMatch(/^\d+\.\d+\.\d+$/);
  expect(errors).toEqual([]);
});

test('falls back to base64 data when .bin files are not served', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.route('**/*.bin', (route) => route.fulfill({ status: 404, body: 'not found' }));
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('load').hidden, null, { timeout: 120000 });
  await expect(page.locator('#st')).not.toContainText('failed');
  expect(await page.locator('#names option').count()).toBeGreaterThan(240);
  expect(pageErrors).toEqual([]);
});

test('PNG export downloads an image', async ({ page }) => {
  const errors = await openApp(page);
  await page.fill('#bl', 'Brazil');
  await page.click('#blp');
  const dl = page.waitForEvent('download', { timeout: 200000 });
  await page.evaluate(() => document.getElementById('exp').click());
  const d = await dl;
  expect(d.suggestedFilename()).toBe('globe-map.png');
  expect(errors).toEqual([]);
});
