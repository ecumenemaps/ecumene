// Seat counter: counts seats per colour on election maps as they are painted, can be moved and switched off, is saved
// with the map and drawn in exports.
const { test, expect } = require('@playwright/test');
const { openApp, getCode, useCode, mode } = require('./helpers');

test.describe.configure({ mode: 'serial' });

const US = 'United States of America';
// paint US states (by name) and UK constituencies (by code) through the saved state, as a map file would
async function paint(page, { blue = [], red = [], gb = [] }) {
  await page.evaluate(
    async ({ blue, red, gb }) => {
      const t = await (await fetch('admin1/USA.json')).json();
      const g = t.objects.u.geometries.map((x) => x.properties);
      const code = (n) =>
        (n === 'District of Columbia' ? g.find((x) => x.ty === 'Federal District') : g.find((x) => x.n === n && x.ty === 'State')).c;
      const s = window.ecumene.getState();
      s.u = [];
      if (blue.length) s.u.push({ c: '#2166ac', k: { 'United States of America': blue.map(code) }, l: 'Democratic' });
      if (red.length) s.u.push({ c: '#b2182b', k: { 'United States of America': red.map(code) }, l: 'Republican' });
      if (gb.length) s.u.push({ c: '#e4572e', k: { 'United Kingdom': gb }, l: 'Labour' });
      window.ecumene.setState(s);
    },
    { blue, red, gb },
  );
  // the painted units load, then the counter counts them
  await page.waitForFunction(() => !!window.ecumene.seats(), null, { timeout: 60000 });
}
const seats = (page) => page.evaluate(() => window.ecumene.seats());

test('electoral votes: counted per colour, majority, the controls', async ({ page }) => {
  const errors = await openApp(page);
  await mode(page, 'legend');
  await expect(page.locator('#sbi')).toContainText('Appears when US states');
  await paint(page, { blue: ['California', 'New York', 'District of Columbia'], red: ['Texas', 'Florida'] });
  let s = await seats(page);
  expect(s.el).toBe('us-ec');
  expect([s.total, s.counted]).toEqual([538, 538]);
  expect(s.parts).toEqual([
    { paint: '#2166ac', seats: 85 },
    { paint: '#b2182b', seats: 70 },
  ]);
  expect(s.uncalled).toBe(538 - 155);
  expect(s.winner).toBeNull();
  await expect(page.locator('#sbi')).toContainText('Counting: Electoral votes (538, 270 for a majority)');
  const r = await page.evaluate(() => window.ecumene.seatRect());
  expect(r.w).toBeGreaterThan(200);
  // every state and DC painted blue: a majority
  const all = await page.evaluate(async () => {
    const t = await (await fetch('admin1/USA.json')).json();
    return t.objects.u.geometries
      .map((x) => x.properties)
      .filter((p) => p.ty === 'State')
      .map((p) => p.n);
  });
  await paint(page, { blue: [...new Set(all), 'District of Columbia'] });
  s = await seats(page);
  expect(s.winner).toEqual({ paint: '#2166ac', seats: 538 });
  // switched off: not drawn
  await page.uncheck('#sbs');
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
  expect(await page.evaluate(() => window.ecumene.seatRect())).toBeNull();
  await page.check('#sbs');
  expect(errors).toEqual([]);
});

test('the counter can be dragged, keeps its place in a map code, and is drawn in the SVG', async ({ page }) => {
  const errors = await openApp(page);
  await paint(page, { blue: ['California'], red: ['Texas'] });
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
  const r = await page.evaluate(() => window.ecumene.seatRect());
  const box = await page.locator('#cv').boundingBox();
  await page.mouse.move(box.x + r.x + 20, box.y + r.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + r.x + 60, box.y + r.y + 210, { steps: 6 });
  await page.mouse.up();
  const st = await page.evaluate(() => window.ecumene.getState());
  expect(st.sb.xy).not.toBeNull();
  // the globe did not turn while the counter was dragged
  const code = await getCode(page);
  await page.reload();
  await page.waitForFunction(() => document.getElementById('load').hidden, null, { timeout: 120000 });
  await useCode(page, code);
  expect((await page.evaluate(() => window.ecumene.getState())).sb.xy).toEqual(st.sb.xy);
  await page.waitForFunction(() => !!window.ecumene.seats(), null, { timeout: 60000 });
  const svg = await page.evaluate(() => window.ecumene.svg());
  expect(svg).toMatch(/<g id="seat-counter">[\s\S]*Electoral votes/);
  expect(svg).toContain('Democratic 54');
  expect(errors).toEqual([]);
});

test('UK constituencies count Commons seats; with two elections painted, a menu picks one', async ({ page }) => {
  const errors = await openApp(page);
  const gb = await page.evaluate(async () => {
    const idx = await (await fetch('layers/index.json')).json();
    const f = idx['United Kingdom'].find((x) => x.id === 'gb-wpc-2024').f;
    const t = await (await fetch('layers/' + f)).json();
    return t.objects.u.geometries.slice(0, 40).map((g) => 'gb-wpc-2024:' + g.properties.c);
  });
  await paint(page, { gb, blue: ['California'] });
  await mode(page, 'legend');
  await expect(page.locator('#sbe')).toBeVisible();
  await page.selectOption('#sbe', 'gb-commons');
  const s = await seats(page);
  expect(s.el).toBe('gb-commons');
  expect([s.total, s.counted]).toEqual([650, 650]);
  expect(s.parts).toEqual([{ paint: '#e4572e', seats: 40 }]);
  await expect(page.locator('#sbi')).toContainText('Counting: House of Commons seats, 2024 boundaries (650, 326 for a majority)');
  expect(errors).toEqual([]);
});
