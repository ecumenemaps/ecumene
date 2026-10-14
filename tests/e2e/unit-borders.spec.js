// Subdivision borders (Style panel): lines between painted subdivisions on the globe and in the SVG, saved with the
// map; and the seat counter's message when every seat is called and no one has a majority.
const { test, expect } = require('@playwright/test');
const { openApp, getCode, useCode, mode } = require('./helpers');

const US = 'United States of America';
// paint US states by name (or Natural Earth code: DC is also named Washington) through the saved state, as a map file would, then wait for their outlines
async function paintStates(page, groups, extra = {}) {
  await page.evaluate(
    async ({ groups, extra, US }) => {
      const t = await (await fetch('admin1/USA.json')).json();
      const g = t.objects.u.geometries.map((x) => x.properties);
      const s = window.ecumene.getState();
      s.u = groups.map(([c, names, l]) => ({
        c,
        l,
        k: {
          [US]:
            names === '*'
              ? g.filter((p) => p.ty === 'State' || p.ty === 'Federal District').map((p) => p.c)
              : names.map((n) => (/^USA-/.test(n) ? n : g.find((p) => p.n === n && p.ty === 'State').c)),
        },
      }));
      Object.assign(s, extra);
      window.ecumene.setState(s);
    },
    { groups, extra, US },
  );
  await page.waitForFunction(() => !!window.ecumene.seats(), null, { timeout: 60000 });
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
}
// the globe's color at a lon/lat, as [r, g, b]
const pixel = (page, g) =>
  page.evaluate((g) => {
    const p = window.ecumene.px(g),
      cv = document.getElementById('cv'),
      c = document.createElement('canvas');
    c.width = cv.width;
    c.height = cv.height;
    const x = c.getContext('2d');
    x.drawImage(cv, 0, 0);
    const k = cv.width / cv.clientWidth;
    return [...x.getImageData(Math.round(p[0] * k), Math.round(p[1] * k), 1, 1).data.slice(0, 3)];
  }, g);
const frame = (page) => page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));

test('subdivision borders: drawn between painted states, set in Style, saved, and in the SVG', async ({ page }) => {
  const errors = await openApp(page);
  // Colorado and Wyoming painted alike: their shared border (41°N) is blue until the borders are switched on
  await paintStates(page, [['#2166ac', ['Colorado', 'Wyoming'], 'Democratic']], { r: [106, -41], z: 6 });
  const onBorder = [-106.5, 41.0];
  const blue = (c) => c[2] > 150 && c[0] < 80;
  expect(blue(await pixel(page, onBorder))).toBe(true);
  await mode(page, 'style');
  await expect(page.locator('#slw')).toBeHidden();
  await page.check('#slon');
  await expect(page.locator('#slw')).toBeVisible();
  await page.locator('#slu').fill('3');
  await frame(page);
  const px = await pixel(page, onBorder);
  expect(Math.min(...px)).toBeGreaterThan(230);
  // a map code keeps the setting
  const st = await page.evaluate(() => window.ecumene.getState());
  expect(st.sl).toEqual({ s: true, c: '#ffffff', w: 3, g: 2 });
  const code = await getCode(page);
  await page.reload();
  await page.waitForFunction(() => document.getElementById('load').hidden, null, { timeout: 120000 });
  await useCode(page, code);
  expect((await page.evaluate(() => window.ecumene.getState())).sl).toEqual(st.sl);
  // the SVG draws them in their own group, white, at the chosen width; the states layer has no larger parts
  const svg = await page.evaluate(() => window.ecumene.svg());
  const group = svg.match(/<g id="subdivision-borders">([\s\S]*?)<\/g>/);
  expect(group).not.toBeNull();
  expect(group[1]).toContain('stroke="#ffffff"');
  expect(group[1]).toContain('stroke-width="3"');
  expect(group[1].match(/<path/g).length).toBe(1);
  // maps saved before the setting existed have no subdivision borders
  await page.evaluate(() => {
    const s = window.ecumene.getState();
    delete s.sl;
    window.ecumene.setState(s);
  });
  await frame(page);
  expect(blue(await pixel(page, onBorder))).toBe(true);
  expect(await page.evaluate(() => window.ecumene.svg())).not.toContain('subdivision-borders');
  expect(errors).toEqual([]);
});

test('congressional districts: thin lines between districts, wide ones between states', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(async (US) => {
    const idx = await (await fetch('layers/index.json')).json();
    const f = idx[US].find((x) => x.id === 'us-cd119').f;
    const t = await (await fetch('layers/' + f)).json();
    const s = window.ecumene.getState();
    s.u = [{ c: '#b2182b', l: 'Republican', k: { [US]: t.objects.u.geometries.slice(0, 30).map((g) => 'us-cd119:' + g.properties.c) } }];
    s.sl = { s: true, c: '#ffffff', w: 0.5, g: 2.5 };
    window.ecumene.setState(s);
  }, US);
  await page.waitForFunction(() => !!window.ecumene.seats(), null, { timeout: 60000 });
  const svg = await page.evaluate(() => window.ecumene.svg());
  const group = svg.match(/<g id="subdivision-borders">([\s\S]*?)<\/g>/)[1];
  const widths = [...group.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => +m[1]);
  expect(widths).toEqual([0.5, 2.5]);
  expect(errors).toEqual([]);
});

test('a 269 to 269 electoral college map says the House decides', async ({ page }) => {
  const errors = await openApp(page);
  // states worth exactly 269 votes in one color, the rest in another
  const half = await page.evaluate(async () => {
    const t = await (await fetch('admin1/USA.json')).json();
    const ev = window.ecumene.electoralVotes;
    const states = t.objects.u.geometries.map((g) => g.properties).filter((p) => ev(p));
    const reach = new Map([[0, []]]);
    for (const p of states)
      for (const [sum, set] of [...reach]) if (sum + ev(p) <= 269 && !reach.has(sum + ev(p))) reach.set(sum + ev(p), [...set, p.c]);
    return reach.get(269);
  });
  const all = await page.evaluate(async () => {
    const t = await (await fetch('admin1/USA.json')).json();
    const ev = window.ecumene.electoralVotes;
    return t.objects.u.geometries
      .map((g) => g.properties)
      .filter((p) => ev(p))
      .map((p) => p.c);
  });
  await paintStates(page, [
    ['#2166ac', half, 'Democratic'],
    ['#b2182b', all.filter((n) => !half.includes(n)), 'Republican'],
  ]);
  const s = await page.evaluate(() => window.ecumene.seats());
  expect(s.parts.map((x) => x.seats)).toEqual([269, 269]);
  expect(s.outcome).toBe('tie');
  const svg = await page.evaluate(() => window.ecumene.svg());
  expect(svg).toMatch(/<g id="seat-counter">[\s\S]*>Tie<[\s\S]*269 to 269: no candidate/);
  expect(errors).toEqual([]);
});
