// Census-year US states and territories from IPUMS NHGIS (1790 to 2020): choosing the layer, its quick stops, the
// hover tag saying which census a border is from, and the full citation in exports.
const { test, expect } = require('@playwright/test');
const { openApp, mode, sourceNote } = require('./helpers');

const L = 'us-nhgis-states-2026';
const US = 'United States of America';

test('census-year US borders: choose the layer, move between censuses, read a unit, export with the citation', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    const s = window.ecumene.getState();
    Object.assign(s, { r: [98, -40], z: 1.6, f: [], u: [] });
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
  const day = () => page.evaluate(() => window.ecumene.day());
  const codes = () => page.evaluate((us) => window.ecumene.unitCodes(us), US);

  // choosing the layer shows the day controls, on 1 January 1850 (a census map), with a stop at each of the censuses named
  await rest(-98, 38.5);
  await expect(page.locator('#sublw')).toBeVisible();
  await page.selectOption('#subl', L);
  await expect(page.locator('#sdw')).toBeVisible();
  await expect(page.locator('#sdl')).toHaveText('1 January 1850');
  await expect(page.locator('#sds .chip')).toHaveText(['1790', '1820', '1850', '1900', '1950', '2000', '2020']);
  await expect.poll(codes).toContain(L + ':texas');
  expect(await codes()).not.toContain(L + ':oklahoma');

  // the hover tag names the unit and which census its borders are from
  await rest(-98.5, 31);
  await expect(page.locator('#tip')).toContainText('Texas');
  await expect(page.locator('#tip')).toContainText('Borders as at the 1850 census');

  // the 1790 stop: thirteen states' worth of map, the rest of the country outside
  await page.click('#sds .chip:has-text("1790")');
  await expect(page.locator('#sdl')).toHaveText('1 January 1790');
  expect(await day()).toBe(17900101);
  await expect.poll(codes).toContain(L + ':northwest-territory');
  expect(await codes()).toContain(L + ':outside');

  // 1900 has Oklahoma and Indian Territories, and 2020 the states of today
  await page.click('#sds .chip:has-text("1900")');
  await expect.poll(codes).toContain(L + ':oklahoma-territory');
  await page.click('#sds .chip:has-text("2020")');
  await expect.poll(codes).toContain(L + ':oklahoma');
  expect(await codes()).not.toContain(L + ':outside');

  // exports say the day and carry NHGIS's full citation, marked simplified
  const svg = await page.evaluate(() => window.ecumene.svg());
  expect(svg).toMatch(/<desc>[^<]*Shown as of 1 January 2020\./);
  expect(svg).toContain('Version 21.0 [dataset]. Minneapolis, MN: IPUMS. 2026. http://doi.org/10.18128/D050.V21.0 (simplified)');
  expect(sourceNote(svg)).toContain('IPUMS NHGIS, University of Minnesota (simplified) (borders as of 1 January 2020)');
  expect(errors).toEqual([]);
});
