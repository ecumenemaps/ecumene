// Historical US states and territories (#46): the dated layer, its day controls, claims beyond today's border, undo,
// map codes and export credits.
const { test, expect } = require('@playwright/test');
const { openApp, getCode, useCode, mode, sourceNote } = require('./helpers');

const L = 'us-ahcb-states-2011';
const US = 'United States of America';

test('historical US borders: choose the layer, move through the years, paint a territory and a claim, save and export', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    const s = window.ecumene.getState();
    Object.assign(s, { r: [105, -44], z: 1.6, f: [], u: [] });
    window.ecumene.setState(s);
  });
  await mode(page, 'paint');
  await page.check('#sub');
  const box = await page.locator('#cv').boundingBox();
  const rest = async (lon, lat) => {
    const p = await page.evaluate((g) => window.ecumene.px(g), [lon, lat]);
    await page.mouse.move(box.x + p[0], box.y + p[1]);
    await page.mouse.move(box.x + p[0] + 1, box.y + p[1] + 1);
    return [box.x + p[0] + 1, box.y + p[1] + 1];
  };
  const painted = () => page.evaluate((us) => Object.fromEntries(window.ecumene.getState().u.flatMap((g) => (g.k[us] || []).map((c) => [c, g.c]))), US);
  const day = () => page.evaluate(() => window.ecumene.day());

  // choosing the layer shows the day controls on 1 January 1850 and marks the land not yet part of the US
  await rest(-98, 38.5);
  await expect(page.locator('#sublw')).toBeVisible();
  await expect(page.locator('#sdw')).toBeHidden();
  await page.selectOption('#subl', L);
  await expect(page.locator('#sdw')).toBeVisible();
  await expect(page.locator('#sdl')).toHaveText('1 January 1850');
  await expect(page.locator('#sds .chip')).toHaveText(['1790', '1820', '1850', '1861', '1890']);
  await expect.poll(painted).toEqual({ [L + ':outside']: 'p:diag:#f2f0eb:#b8b2a7' });

  // a quick stop
  await page.click('#sds .chip:has-text("1820")');
  await expect(page.locator('#sdl')).toHaveText('1 January 1820');
  await expect(page.locator('#sds .chip.on')).toHaveText('1820');
  expect(await day()).toBe(18200101);
  await expect.poll(() => page.evaluate((us) => window.ecumene.unitCodes(us), US)).toContain(L + ':mo_terr');

  // the tag names the territory, with its days and the Atlas's note
  const mo = await rest(-92.5, 38.5);
  await expect(page.locator('#tip')).toContainText('Missouri Territory');
  await expect(page.locator('#tip .ti')).toContainText('4 Jul 1819 – 9 Aug 1821');
  await page.mouse.click(mo[0], mo[1]);
  await expect.poll(async () => Object.keys(await painted()).sort()).toEqual([L + ':mo_terr', L + ':outside']);

  // Oregon Country reaches into today's Canada: pointing there finds the claim, and a click paints it
  const bc = await rest(-123, 52.5);
  await expect(page.locator('#tip')).toContainText('Oregon Country');
  await page.mouse.click(bc[0], bc[1]);
  await expect.poll(async () => Object.keys(await painted())).toContain(L + ':or_country');

  // the slider moves by year; the paint follows the place, so Missouri Territory keeps its color but is not shown
  await page.evaluate(() => {
    const y = document.getElementById('sdy');
    y.value = '1861';
    y.dispatchEvent(new Event('input'));
    y.dispatchEvent(new Event('change'));
  });
  await expect(page.locator('#sdl')).toHaveText('1 January 1861');
  await expect.poll(() => page.evaluate((us) => window.ecumene.unitCodes(us), US)).toContain(L + ':mo_state');
  expect(await page.evaluate((us) => window.ecumene.unitCodes(us), US)).not.toContain(L + ':mo_terr');
  expect(Object.keys(await painted())).toContain(L + ':mo_terr');

  // an exact day; undo goes back to it, then to 1861
  // (fill fires change; a second change for the same day must not make a second undo step)
  await page.fill('#sdd', '1821-08-10');
  await page.locator('#sdd').dispatchEvent('change');
  await expect(page.locator('#sdl')).toHaveText('10 August 1821');
  // (in the date box Ctrl+Z is the box's own)
  await page.locator('#sdd').blur();
  await page.keyboard.press('Control+z');
  await expect(page.locator('#sdl')).toHaveText('1 January 1861');
  expect(await day()).toBe(18610101);

  // a map code keeps the day
  const code = await getCode(page);
  await page.evaluate(() => window.ecumene.setState(Object.assign(window.ecumene.getState(), { u: [], sd: 18000101 })));
  expect(await day()).toBe(18000101);
  await useCode(page, code);
  expect(await day()).toBe(18610101);
  await mode(page, 'paint');
  await page.click('#sds .chip:has-text("1820")');

  // exports name the units and say the day and the source
  const svg = await page.evaluate(() => window.ecumene.svg());
  expect(svg).toContain('data-name="Oregon Country" data-country="United States of America"');
  expect(svg).toContain('data-name="Missouri Territory"');
  expect(svg).toMatch(/<desc>[^<]*Shown as of 1 January 1820\.[^<]*Borders of every other country on the map are present-day ones\.[^<]*The Newberry Library, 2011\./);
  expect(sourceNote(svg)).toContain('Atlas of Historical County Boundaries, The Newberry Library, Chicago (borders as of 1 January 1820)');
  expect(errors).toEqual([]);
});
