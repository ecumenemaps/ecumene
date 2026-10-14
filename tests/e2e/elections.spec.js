// Election maps (Paint panel): the picker sets up a blank map of an election with party colors, white borders and the
// seat counter; the 2026 Senate map counts the seats not up for the party holding them; exports credit the data.
const { test, expect } = require('@playwright/test');
const { openApp, mode, sourceNote } = require('./helpers');

const US = 'United States of America';
async function start(page, id) {
  await mode(page, 'paint');
  await page.selectOption('#elk', id);
  await page.click('#elgo');
  await page.waitForFunction((id) => window.ecumene.seats() && window.ecumene.seats().el === id, id, { timeout: 60000 });
}
// the seat counter's text in an SVG, its wrapped lines joined
const counterText = (svg) =>
  [...(/<g id="seat-counter">([\s\S]*?)<\/g>/.exec(svg) || ['', ''])[1].matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => m[1]).join(' ');
const seats = (page) => page.evaluate(() => window.ecumene.seats());
const groups = async (page) => Object.fromEntries((await seats(page)).groups.map((g) => [g.key, [g.seats, g.held]]));
async function clickAt(page, g) {
  const box = await page.locator('#cv').boundingBox(),
    p = await page.evaluate((g) => window.ecumene.px(g), g);
  await page.mouse.move(box.x + p[0], box.y + p[1]);
  await page.mouse.click(box.x + p[0] + 1, box.y + p[1] + 1);
}

test('2026 Senate: 35 seats to paint, the others counted for the party holding them, credited in exports', async ({ page }) => {
  const errors = await openApp(page);
  await start(page, 'us-senate-2026');
  let s = await seats(page);
  expect([s.total, s.counted, s.uncalled]).toEqual([100, 100, 35]);
  expect(await groups(page)).toEqual({ D: [32, 32], R: [31, 31], I: [2, 2] });
  const st = await page.evaluate(() => window.ecumene.getState());
  // the 15 states with no race are marked and named; the palette has the party colors; white borders
  expect(st.u.find((g) => g.l === 'No Senate race in 2026').k[US].length).toBe(15);
  expect(st.ps).toBe('US elections');
  await expect(page.locator('#sub')).toBeChecked();
  expect(st.sl).toMatchObject({ s: true, c: '#ffffff' });
  expect(st.lg.t).toBe('US Senate, 2026 elections');
  await expect(page.locator('#pal .sw')).toHaveCount(8);
  await expect(page.locator('#psetn')).toContainText('safe, likely and lean');
  // Texas in safe Republican: one more Republican seat; then a toss-up in Georgia counts for no one
  await page.waitForTimeout(800); // the view eases to the US
  await page.click('#pal .sw >> nth=3');
  await clickAt(page, [-99, 31.5]);
  await expect.poll(async () => (await groups(page)).R).toEqual([32, 31]);
  await page.click('#pal .sw >> nth=7');
  await clickAt(page, [-83.4, 32.7]);
  await expect.poll(async () => (await groups(page)).T).toEqual([1, 0]);
  s = await seats(page);
  expect([s.uncalled, s.outcome]).toEqual([33, 'open']);
  // the export credits the table and says how old it is
  const svg = await page.evaluate(() => window.ecumene.svg());
  // the note on the image wraps where it fits, so read it as one line
  expect(sourceNote(svg)).toMatch(/Senate seats: congress-legislators \(CC0\), 2026-\d\d-\d\d/);
  expect(svg).toMatch(/<desc>[\s\S]*congress-legislators \(CC0\), read on 2026-\d\d-\d\d/);
  expect(counterText(svg)).toContain('2 independents caucus with the Democrats');
  expect(counterText(svg)).toContain('Republican 32 (31 not up)');
  expect(errors).toEqual([]);
});

test('starting over asks first; the Electoral College map credits the Census', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    const s = window.ecumene.getState();
    s.f = [{ c: '#e4572e', n: ['France'], l: '' }];
    window.ecumene.setState(s);
  });
  await mode(page, 'paint');
  await page.selectOption('#elk', 'us-ec');
  page.once('dialog', (d) => d.dismiss());
  await page.click('#elgo');
  await page.waitForTimeout(300);
  expect((await page.evaluate(() => window.ecumene.getState())).f.length).toBe(1);
  page.once('dialog', (d) => d.accept());
  await start(page, 'us-ec');
  const st = await page.evaluate(() => window.ecumene.getState());
  expect(st.f).toEqual([]);
  const s = await seats(page);
  expect([s.counted, s.uncalled]).toEqual([538, 538]);
  const svg = await page.evaluate(() => window.ecumene.svg());
  expect(sourceNote(svg)).toContain('electoral votes: U.S. Census Bureau 2020 apportionment');
  // undo brings France back
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await page.evaluate(() => window.ecumene.getState())).f.length).toBe(1);
  expect(errors).toEqual([]);
});

test('Senate composition: a state painted in two-color stripes has one senator of each party', async ({ page }) => {
  const errors = await openApp(page);
  await start(page, 'us-senate');
  await page.evaluate(async (US) => {
    const t = await (await fetch('admin1/USA.json')).json();
    const states = t.objects.u.geometries.map((g) => g.properties).filter((p) => p.ty === 'State');
    const s = window.ecumene.getState();
    s.u = [
      { c: '#1c408c', l: 'Safe Democratic', k: { [US]: states.slice(0, 20).map((p) => p.c) } },
      { c: 'p:diagw:#1c408c:#bf1d29', l: 'Split', k: { [US]: states.slice(20, 22).map((p) => p.c) } },
      { c: '#bf1d29', l: 'Safe Republican', k: { [US]: states.slice(22).map((p) => p.c) } },
    ];
    window.ecumene.setState(s);
  }, US);
  await expect.poll(async () => (await groups(page)).D).toEqual([42, 0]);
  expect((await groups(page)).R).toEqual([58, 0]);
  expect((await seats(page)).outcome).toBe('majority');
  expect(errors).toEqual([]);
});
