const { test, expect } = require('@playwright/test');
const { openApp, status, globeCentre, getCode, useCode, regionRows, mode } = require('./helpers');

test.describe.configure({ mode: 'serial' });

test('loads with no errors and lists countries', async ({ page }) => {
  const errors = await openApp(page);
  expect(await page.locator('#names option').count()).toBeGreaterThan(240);
  expect(errors).toEqual([]);
});

test('panel modes: tabs, keys, collapse, memory and phone layout', async ({ page }) => {
  const errors = await openApp(page);
  const visible = (m) => page.locator(`#panel .mode[data-mode=${m}]`);
  await page.click('#rail [data-mode=style]');
  await expect(visible('style')).toBeVisible();
  await expect(visible('paint')).toBeHidden();
  await page.locator('#cv').click({ position: { x: 5, y: 5 } }); // focus the page, off the globe
  await page.keyboard.press('6');
  await expect(visible('export')).toBeVisible();
  // a second click on the open tab hides the panel and widens the map
  const w0 = (await page.locator('#stage').boundingBox()).width;
  await page.click('#rail [data-mode=export]');
  await expect(page.locator('#panel')).toBeHidden();
  expect((await page.locator('#stage').boundingBox()).width).toBeGreaterThan(w0 + 200);
  await page.click('#rail [data-mode=draw]');
  await expect(visible('draw')).toBeVisible();
  // the mode is remembered across reloads
  await page.reload();
  await page.waitForFunction(() => document.getElementById('load').hidden, null, { timeout: 120000 });
  await expect(visible('draw')).toBeVisible();
  // phone: tab bar at the bottom, panel as a sheet between globe and tabs
  await page.setViewportSize({ width: 390, height: 800 });
  const rail = await page.locator('#rail').boundingBox(),
    panel = await page.locator('#panel').boundingBox(),
    stage = await page.locator('#stage').boundingBox();
  expect(rail.y + rail.height).toBeGreaterThan(780);
  expect(panel.y).toBeGreaterThan(stage.y + 200);
  expect(rail.width).toBeGreaterThan(380);
  expect(errors).toEqual([]);
});

test('legend shows on the map, drags, and keeps its place in exports', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    const s = window.ecumene.getState();
    s.f = [{ c: '#e4572e', n: ['France'], l: 'Members' }];
    window.ecumene.setState(s);
  });
  await page.waitForFunction(() => !!document.querySelector('#cv') && window.ecumene && true);
  const r0 = await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => ok(window.ecumene.legendRect()))));
  expect(r0).not.toBeNull();
  const b = await page.locator('#cv').boundingBox();
  const sx = b.x + r0.x + r0.w / 2,
    sy = b.y + r0.y + r0.h / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 300, sy - 250, { steps: 6 });
  await page.mouse.up();
  const st = await page.evaluate(() => window.ecumene.getState());
  expect(st.lg.xy).not.toBeNull();
  const r1 = await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => ok(window.ecumene.legendRect()))));
  expect(Math.round(r1.x - r0.x)).toBe(300);
  expect(Math.round(r1.y - r0.y)).toBe(-250);
  // dragging the legend does not rotate the globe or paint
  expect(st.f).toEqual([{ c: '#e4572e', n: ['France'], l: 'Members' }]);
  await mode(page, 'legend');
  await expect(page.locator('#lp')).toHaveValue('xy');
  // the SVG legend is in the same place
  const svg = await page.evaluate(() => window.ecumene.svg());
  const m = /<g id="legend">\s*<path d="M([\d.]+) ([\d.]+)/.exec(svg);
  expect(Math.abs(+m[1] - r1.x)).toBeLessThan(1);
  expect(Math.abs(+m[2] - r1.y)).toBeLessThan(1);
  // back to a corner
  await page.selectOption('#lp', 'tr');
  expect((await page.evaluate(() => window.ecumene.getState())).lg.xy).toBeNull();
  expect(errors).toEqual([]);
});

test('home page: no third-party requests, continue button, and its links open the editor', async ({ page }) => {
  const hosts = new Set();
  page.on('request', (r) => hosts.add(new URL(r.url()).host));
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Ecumene');
  await expect(page.locator('#cont')).toBeHidden();
  await expect(page.locator('#cap')).toContainText('Orthographic projection, centred on');
  await expect(page.locator('.plates img')).toHaveCount(4);
  await page.waitForLoadState('networkidle');
  expect([...hosts]).toEqual(['127.0.0.1:8790']);
  // an example opens in the editor, painted, with its export settings
  await page.click('a[href="app/?example=eu"]');
  await page.waitForFunction(() => window.ecumene && document.getElementById('load').hidden, null, { timeout: 120000 });
  await expect(page.locator('#st')).toContainText('Example opened');
  const st = await page.evaluate(() => window.ecumene.getState());
  expect(st.f[0].n.length).toBe(32); // 27 member states plus France's five overseas regions
  expect(st.s.land).toBe('#b9b9b9');
  await expect(page.locator('#xw')).toHaveValue('550');
  expect(new URL(page.url()).search).toBe('');
  // the saved map now offers "Continue" on the home page; "start" links open ready-made setups
  await page.waitForTimeout(3500); // autosave interval
  await page.goto('/');
  await expect(page.locator('#cont')).toBeVisible();
  await expect(page.locator('#newnote')).toBeVisible();
  await page.goto('/app/?start=flat');
  await page.waitForFunction(() => window.ecumene && document.getElementById('load').hidden, null, { timeout: 120000 });
  await expect(page.locator('#xproj')).toHaveValue('equalearth');
  expect((await page.evaluate(() => window.ecumene.getState())).f).toEqual([]);
  expect(pageErrors).toEqual([]);
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

test('small countries get markers that paint, export and hide when zoomed in', async ({ page }) => {
  const errors = await openApp(page);
  // centre on Italy at the starting zoom
  const at = (r, z, tiny = true) =>
    page.evaluate(
      ([r, z, tiny]) => {
        const s = window.ecumene.getState();
        Object.assign(s, { r, z, f: [] });
        s.L.tiny = tiny;
        window.ecumene.setState(s);
        return window.ecumene.markers();
      },
      [r, z, tiny],
    );
  let marks = await at([-12, -42], 1);
  const names = marks.map((m) => m.n);
  for (const n of ['Vatican', 'Monaco', 'San Marino', 'Malta']) expect(names).toContain(n);
  expect(names).not.toContain('Italy');
  const v = marks.find((m) => m.n === 'Vatican'),
    box = await page.locator('#cv').boundingBox();
  await page.mouse.click(box.x + v.x, box.y + v.y);
  const st = await page.evaluate(() => window.ecumene.getState());
  expect(st.f.flatMap((g) => g.n)).toEqual(['Vatican']);
  await expect(page.locator('#lgd .lg')).toHaveCount(1);
  const svg = await page.evaluate(() => window.ecumene.svg());
  expect(svg).toMatch(new RegExp('<circle id="marker-Vatican" data-name="Vatican"[^>]*fill="' + st.f[0].c + '"'));
  expect(svg).toContain('data-name="Monaco"');
  // zoomed in, Malta (316 km²) is big enough to click but the Vatican (no area at all) keeps its marker
  marks = (await at([-12, -42], 30)).map((m) => m.n);
  expect(marks).toContain('Vatican');
  expect(marks).not.toContain('Malta');
  // the layer can be turned off
  expect(await at([-12, -42], 1, false)).toEqual([]);
  await expect(page.locator('input[data-k=tiny]')).not.toBeChecked();
  expect(errors).toEqual([]);
});

test('overseas parts paint on their own; maps saved before the split keep their look', async ({ page }) => {
  const errors = await openApp(page);
  const PARTS = ['French Guiana', 'Guadeloupe', 'Martinique', 'Mayotte', 'Réunion', 'Caribbean Netherlands'];
  const load = (s) =>
    page.evaluate((s) => {
      window.ecumene.setState(Object.assign(window.ecumene.getState(), s));
      return window.ecumene.getState();
    }, s);
  // centred on French Guiana, a click paints it and not France
  await load({ f: [], r: [53.2, -3.9], z: 4 });
  const c = await globeCentre(page);
  await page.mouse.click(c.x, c.y);
  let st = await page.evaluate(() => window.ecumene.getState());
  expect(st.d).toBe('ne10m-2');
  expect(st.f.flatMap((g) => g.n)).toEqual(['French Guiana']);
  // painting France and the Netherlands now leaves their overseas parts alone
  st = await load({ d: 'ne10m-2', f: [{ c: '#123456', n: ['France', 'Netherlands'], l: '' }] });
  expect(st.f[0].n.sort()).toEqual(['France', 'Netherlands']);
  // an older map painted them with their parent, so loading one adds the parts in the same colour
  st = await load({ d: 'ne10m', f: [{ c: '#123456', n: ['France', 'Netherlands'], l: '' }] });
  expect(st.f[0].n.sort()).toEqual(['France', 'Netherlands', ...PARTS].sort());
  expect(errors).toEqual([]);
});

test('subdivisions load under the pointer and paint by unit or constituent part', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    const s = window.ecumene.getState();
    Object.assign(s, { r: [4, -55], z: 5, f: [], u: [] });
    window.ecumene.setState(s);
  });
  await mode(page, 'paint');
  await page.check('#sub');
  await page.selectOption('#subd', 'g');
  const box = await page.locator('#cv').boundingBox(),
    at = async (lon, lat) => {
      const p = await page.evaluate((g) => window.ecumene.px(g), [lon, lat]);
      return [box.x + p[0], box.y + p[1]];
    };
  const units = () => page.evaluate(() => window.ecumene.getState().u.map((g) => [g.c, Object.values(g.k).flat().length]));
  // resting on Scotland loads the UK and names what a click paints
  const sc = await at(-4.2, 56.8);
  await page.mouse.move(sc[0], sc[1]);
  await page.mouse.move(sc[0] + 2, sc[1] + 1);
  await expect(page.locator('#tip')).toHaveText('Scotland');
  await page.mouse.click(sc[0] + 2, sc[1] + 1);
  await expect.poll(units).toEqual([['#e4572e', 32]]);
  await expect(page.locator('#lgd .lg small')).toHaveText(['32']);
  // finest units: one county in another colour
  await page.selectOption('#subd', 'u');
  await page.click('#pal .sw >> nth=5');
  const yk = await at(-1.1, 54.0);
  await page.mouse.move(yk[0], yk[1]);
  await expect(page.locator('#tip')).toHaveText('York · Yorkshire and the Humber');
  await page.mouse.click(yk[0], yk[1]);
  await expect.poll(units).toEqual([
    ['#e4572e', 32],
    ['#3d8bd9', 1],
  ]);
  // a click on a country that has not loaded yet (no resting pointer, as on touch) loads it and then paints
  const ie = await at(-8.0, 53.3);
  await page.mouse.click(ie[0], ie[1]);
  await expect.poll(async () => (await page.evaluate(() => window.ecumene.getState().u)).some((g) => g.k.Ireland)).toBe(true);
  expect((await page.evaluate(() => window.ecumene.getState())).f).toEqual([]);
  await page.click('#un');
  await expect.poll(units).toEqual([
    ['#e4572e', 32],
    ['#3d8bd9', 1],
  ]);
  // painted units survive a map code and export as named SVG paths
  const code = await getCode(page);
  await page.evaluate(() => window.ecumene.setState(Object.assign(window.ecumene.getState(), { u: [] })));
  await useCode(page, code);
  await expect.poll(units).toEqual([
    ['#e4572e', 32],
    ['#3d8bd9', 1],
  ]);
  const svg = await page.evaluate(() => window.ecumene.svg());
  expect(svg).toContain('<g id="subdivisions">');
  expect(svg.split('data-country="United Kingdom"').length - 1).toBe(33);
  expect(svg).toMatch(/<path id="unit-GBR-2120" data-name="York" data-country="United Kingdom"/);
  // painting the whole country again (Subdivisions off) turns it back into one colour
  await mode(page, 'paint');
  await page.uncheck('#sub');
  const en = await at(-1.5, 52.5);
  await page.mouse.click(en[0], en[1]);
  const st = await page.evaluate(() => window.ecumene.getState());
  expect(st.u).toEqual([]);
  expect(st.f).toEqual([{ c: '#3d8bd9', n: ['United Kingdom'], l: '' }]);
  expect(errors).toEqual([]);
});

test('the IJsselmeer is water at every Lakes setting: clicks there paint nothing', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    const s = window.ecumene.getState();
    Object.assign(s, { r: [-5.4, -52.6], z: 30, f: [], u: [] });
    s.L.lakes = 'none';
    window.ecumene.setState(s);
  });
  // lakes load after the first frame; the SVG has the always-water group once they have
  await expect.poll(async () => (await page.evaluate(() => window.ecumene.svg())).includes('<g id="inland-sea">')).toBe(true);
  const svg = await page.evaluate(() => window.ecumene.svg());
  expect(svg).not.toContain('<g id="lakes">');
  expect(svg).toContain('Lakes and rivers: Natural Earth');
  const box = await page.locator('#cv').boundingBox(),
    at = async (lon, lat) => {
      const p = await page.evaluate((g) => window.ecumene.px(g), [lon, lat]);
      return [box.x + p[0], box.y + p[1]];
    };
  const st = () => page.evaluate(() => window.ecumene.getState());
  // IJsselmeer and Markermeer paint nothing, Flevoland paints the Netherlands
  for (const [lon, lat] of [
    [5.35, 52.75],
    [5.25, 52.5],
  ]) {
    const q = await at(lon, lat);
    await page.mouse.click(q[0], q[1]);
  }
  expect((await st()).f).toEqual([]);
  const fl = await at(5.6, 52.5);
  await page.mouse.click(fl[0], fl[1]);
  expect((await st()).f.flatMap((g) => g.n)).toEqual(['Netherlands']);
  // with subdivisions on, the water is not part of a province either
  await mode(page, 'paint');
  await page.check('#sub');
  const ij = await at(5.35, 52.75);
  await page.mouse.move(ij[0], ij[1]);
  await page.mouse.move(ij[0] + 2, ij[1] + 1);
  await page.waitForTimeout(400);
  await page.mouse.click(ij[0] + 2, ij[1] + 1);
  await page.waitForTimeout(400);
  expect((await st()).u).toEqual([]);
  await page.mouse.click(fl[0], fl[1]);
  await expect.poll(async () => (await st()).u.flatMap((g) => g.k.Netherlands || []).length).toBe(1);
  expect(errors).toEqual([]);
});

test('SVG export cuts the lakes the map shows out of country and subdivision shapes', async ({ page }) => {
  const errors = await openApp(page);
  const set = (s) =>
    page.evaluate((s) => {
      const st = window.ecumene.getState();
      Object.assign(st, s.st);
      st.L.lakes = s.lakes;
      window.ecumene.setState(st);
    }, s);
  // whether a point (lon, lat) is inside an element's fill in the exported SVG (screen export: SVG pixels are canvas pixels)
  const inFill = (svg, sel, g) =>
    page.evaluate(
      ([svg, sel, g]) => {
        let box = document.getElementById('svg-check');
        if (!box) {
          box = document.createElement('div');
          box.id = 'svg-check';
          box.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden';
          document.body.append(box);
        }
        box.innerHTML = svg.replace(/^<\?xml[^>]*>/, '');
        const [x, y] = window.ecumene.px(g);
        return box.querySelector(sel).isPointInFill(new DOMPoint(x, y));
      },
      [svg, sel, g],
    );
  // Lakes = None: the IJsselmeer is still cut out of the Netherlands and its painted province
  await set({ st: { r: [-5.4, -52.6], z: 30, f: [{ c: '#123456', n: ['Netherlands'], l: '' }], u: [] }, lakes: 'none' });
  await expect.poll(async () => (await page.evaluate(() => window.ecumene.svg())).includes('<g id="inland-sea">')).toBe(true);
  await mode(page, 'paint');
  await page.check('#sub');
  const box = await page.locator('#cv').boundingBox(),
    fl = await page.evaluate((g) => window.ecumene.px(g), [5.6, 52.5]);
  await page.mouse.move(box.x + fl[0], box.y + fl[1]);
  await page.mouse.move(box.x + fl[0] + 1, box.y + fl[1] + 1);
  await page.mouse.click(box.x + fl[0] + 1, box.y + fl[1] + 1);
  await expect.poll(async () => (await page.evaluate(() => window.ecumene.getState())).u.length).toBe(1);
  let svg = await page.evaluate(() => window.ecumene.svg());
  expect(svg).toContain('have the IJsselmeer cut out');
  expect(await inFill(svg, '#country-Netherlands', [5.35, 52.75])).toBe(false);
  expect(await inFill(svg, '#country-Netherlands', [5.25, 52.5])).toBe(false);
  expect(await inFill(svg, '#country-Netherlands', [5.6, 52.5])).toBe(true);
  expect(await inFill(svg, '#subdivisions path', [5.6, 52.5])).toBe(true);
  expect(await inFill(svg, '#subdivisions path', [5.25, 52.5])).toBe(false);
  // Lakes = Major: Lake Victoria is not part of Uganda
  await set({ st: { r: [-33, 0], z: 12, f: [{ c: '#123456', n: ['Uganda'], l: '' }], u: [] }, lakes: 'major' });
  svg = await page.evaluate(() => window.ecumene.svg());
  expect(svg).toContain('the IJsselmeer and the major lakes cut out');
  expect(await inFill(svg, '#country-Uganda', [33, -0.5])).toBe(false);
  expect(await inFill(svg, '#country-Uganda', [32.6, 0.3])).toBe(true);
  // Lakes = All: Georgian Bay is water (it was a second copy over Lake Huron, which an even-odd fill showed as land)
  await set({ st: { r: [81.5, -45], z: 9, f: [], u: [] }, lakes: 'all' });
  svg = await page.evaluate(() => window.ecumene.svg());
  expect(await inFill(svg, '#lakes path', [-80.6, 45.3])).toBe(true);
  expect(await inFill(svg, '#country-Canada', [-80.6, 45.3])).toBe(false);
  expect(await inFill(svg, '#country-Canada', [-82.0, 45.8])).toBe(true); // Manitoulin Island
  // a whole-world flat map with every lake cut stays quick
  const ms = await page.evaluate(async () => {
    const t = performance.now();
    await window.ecumene.svg({ proj: 'equalearth', area: 'world', width: 1600 });
    return performance.now() - t;
  });
  expect(ms).toBeLessThan(20000);
  expect(errors).toEqual([]);
});

test('subdivision layers: switch the UK to Westminster constituencies, paint, save and export with credits', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    const s = window.ecumene.getState();
    Object.assign(s, { r: [2.5, -54.5], z: 5, f: [], u: [] });
    window.ecumene.setState(s);
  });
  await mode(page, 'paint');
  await page.check('#sub');
  const box = await page.locator('#cv').boundingBox(),
    at = async (lon, lat) => {
      const p = await page.evaluate((g) => window.ecumene.px(g), [lon, lat]);
      return [box.x + p[0], box.y + p[1]];
    };
  const rest = async (lon, lat) => {
    const q = await at(lon, lat);
    await page.mouse.move(q[0], q[1]);
    await page.mouse.move(q[0] + 1, q[1] + 1);
    return [q[0] + 1, q[1] + 1];
  };
  const units = () => page.evaluate(() => window.ecumene.getState().u.flatMap((g) => g.k['United Kingdom'] || []));
  // pointing at the UK shows its layers; Natural Earth's states and provinces come first
  const yk = await rest(-1.1, 54.0);
  await expect(page.locator('#sublw')).toBeVisible();
  await expect(page.locator('#subln')).toHaveText('United Kingdom');
  await expect(page.locator('#subl option').nth(1)).toHaveText('Westminster constituencies (2024)');
  await expect(page.locator('#tip')).toHaveText('York · Yorkshire and the Humber');
  await page.mouse.click(yk[0], yk[1]);
  await expect.poll(units).toEqual(['GBR-2120']);
  // switching asks first; saying no keeps the painted county
  page.once('dialog', (d) => d.dismiss());
  await page.selectOption('#subl', 'gb-wpc-2024');
  await expect(page.locator('#subl')).toHaveValue('');
  expect(await units()).toEqual(['GBR-2120']);
  let asked = '';
  page.once('dialog', (d) => {
    asked = d.message();
    d.accept();
  });
  await page.selectOption('#subl', 'gb-wpc-2024');
  await expect.poll(units).toEqual([]);
  expect(asked).toContain('This clears 1 painted subdivision');
  await expect(page.locator('#subls')).toContainText('650 units');
  await expect(page.locator('#subls')).toContainText('Office for National Statistics');
  // undo brings the county back (and with it the Natural Earth layer)
  await page.keyboard.press('Control+z');
  await expect.poll(units).toEqual(['GBR-2120']);
  page.once('dialog', (d) => d.accept());
  await page.selectOption('#subl', 'gb-wpc-2024');
  await expect.poll(units).toEqual([]);
  // one constituency, then every Scottish constituency (57) at once
  const nn = await rest(-1.95, 55.45);
  await expect(page.locator('#tip')).toHaveText('North Northumberland');
  await page.mouse.click(nn[0], nn[1]);
  await expect.poll(units).toEqual(['gb-wpc-2024:E14001397']);
  await page.selectOption('#subd', 'g');
  await page.click('#pal .sw >> nth=5');
  const sc = await rest(-4.2, 56.8);
  await expect(page.locator('#tip')).toHaveText('Scotland');
  await page.mouse.click(sc[0], sc[1]);
  await expect.poll(async () => (await units()).length).toBe(58);
  // a map code keeps the layer
  const code = await getCode(page);
  await page.evaluate(() => window.ecumene.setState(Object.assign(window.ecumene.getState(), { u: [] })));
  await useCode(page, code);
  await expect.poll(async () => (await units()).length).toBe(58);
  // exports name the units and credit ONS and OS
  const svg = await page.evaluate(() => window.ecumene.svg());
  expect(svg).toContain('data-name="North Northumberland" data-country="United Kingdom"');
  expect(svg).toMatch(/<desc>[^<]*Westminster parliamentary constituencies \(UK, July 2024\)[^<]*Office for National Statistics licensed under the Open Government Licence v\.3\.0[^<]*Contains OS data/);
  expect(svg).toContain('ONS, OS (OGL v3)');
  expect(svg).not.toContain('Natural Earth 1:10m Admin 1');
  // exact outlines from a layer: the picker opens on the layer the UK is painted with, and the outline remembers it
  await mode(page, 'draw');
  await page.click('#a1o');
  await page.fill('#a1c', 'United Kingdom');
  await page.locator('#a1c').dispatchEvent('change');
  await expect(page.locator('#a1y')).toBeVisible();
  await expect(page.locator('#a1y')).toHaveValue('gb-wpc-2024');
  await expect(page.locator('#a1s')).toHaveText('0 of 650 selected');
  await page.click('#a1g .chip:has-text("Wales")');
  await expect(page.locator('#a1s')).toHaveText('32 of 650 selected');
  await page.click('#a1ok');
  await expect(page.locator('#st')).toHaveText('Exact outline added: Wales.');
  const ref = await page.evaluate(() => window.ecumene.getState().g.at(-1).ref);
  expect(ref.y).toBe('gb-wpc-2024');
  expect(ref.ids.length).toBe(32);
  expect(errors).toEqual([]);
});

test('UK and Ireland pack: every layer offered, ceremonial and historic counties, Irish counties by province', async ({ page }) => {
  const errors = await openApp(page);
  const view = (r, z) =>
    page.evaluate(
      ([r, z]) => {
        const s = window.ecumene.getState();
        Object.assign(s, { r, z, f: [], u: [] });
        window.ecumene.setState(s);
      },
      [r, z],
    );
  await view([2.5, -54.5], 5);
  await mode(page, 'paint');
  await page.check('#sub');
  const box = await page.locator('#cv').boundingBox();
  const rest = async (lon, lat) => {
    const p = await page.evaluate((g) => window.ecumene.px(g), [lon, lat]);
    await page.mouse.move(box.x + p[0], box.y + p[1]);
    await page.mouse.move(box.x + p[0] + 1, box.y + p[1] + 1);
    return [box.x + p[0] + 1, box.y + p[1] + 1];
  };
  await rest(-1.1, 54.0);
  await expect(page.locator('#subl option')).toHaveText([
    'States and provinces (Natural Earth)',
    'Westminster constituencies (2024)',
    'Counties and unitary authorities (2025)',
    'Ceremonial counties',
    'Historic counties',
  ]);
  await page.selectOption('#subl', 'gb-ceremonial-2026');
  await expect(page.locator('#subls')).toContainText('county boroughs of Belfast and Londonderry, which are not in the open data');
  await rest(-1.2, 54.05);
  await expect(page.locator('#tip')).toHaveText('North Yorkshire');
  await page.selectOption('#subl', 'gb-historic');
  await rest(-1.1, 54.0);
  await expect(page.locator('#tip')).toHaveText('Yorkshire');
  // Ireland: its own layers; counties grouped by province
  await view([7.8, -53.3], 5);
  const kd = await rest(-6.8, 53.15);
  await expect(page.locator('#subln')).toHaveText('Ireland');
  await expect(page.locator('#subl option')).toHaveText(['States and provinces (Natural Earth)', 'Counties (26)', 'Local authority areas (31)', 'Dáil constituencies (2023)']);
  await page.selectOption('#subl', 'ie-counties-2019');
  await page.selectOption('#subd', 'r');
  await rest(-6.8, 53.15);
  await expect(page.locator('#tip')).toHaveText('Leinster');
  await page.mouse.click(kd[0], kd[1]);
  await expect.poll(() => page.evaluate(() => window.ecumene.getState().u.flatMap((g) => g.k.Ireland || []).length)).toBe(12);
  const svg = await page.evaluate(() => window.ecumene.svg());
  expect(svg).toContain('© Tailte Éireann, licensed under Creative Commons Attribution 4.0');
  expect(svg).toContain('Tailte Éireann (CC BY 4.0)');
  expect(errors).toEqual([]);
});

test('US pack: counties by state, congressional districts, Puerto Rico municipios', async ({ page }) => {
  const errors = await openApp(page);
  const view = (r, z) =>
    page.evaluate(
      ([r, z]) => {
        const s = window.ecumene.getState();
        Object.assign(s, { r, z, f: [], u: [] });
        window.ecumene.setState(s);
      },
      [r, z],
    );
  await view([98, -39], 2.6);
  await mode(page, 'paint');
  await page.check('#sub');
  const box = await page.locator('#cv').boundingBox();
  const rest = async (lon, lat) => {
    const p = await page.evaluate((g) => window.ecumene.px(g), [lon, lat]);
    await page.mouse.move(box.x + p[0], box.y + p[1]);
    await page.mouse.move(box.x + p[0] + 1, box.y + p[1] + 1);
    return [box.x + p[0] + 1, box.y + p[1] + 1];
  };
  const units = () => page.evaluate(() => window.ecumene.getState().u.flatMap((g) => g.k['United States of America'] || []));
  await rest(-98.5, 38.5);
  await expect(page.locator('#subl option')).toHaveText(['States and provinces (Natural Earth)', 'Counties (2024)', 'Congressional districts (119th Congress)']);
  // 3,144 counties: the largest layer; note how long they take to load and triangulate
  const t0 = Date.now();
  await page.selectOption('#subl', 'us-counties-2024');
  const ks = await rest(-98.5, 38.5);
  await expect(page.locator('#tip')).toHaveText(/ County$/, { timeout: 60000 });
  console.log('US counties ready in ' + (Date.now() - t0) + ' ms');
  await expect(page.locator('#subls')).toContainText("Connecticut's nine planning regions");
  await page.selectOption('#subd', 'g');
  await rest(-98.5, 38.5);
  await expect(page.locator('#tip')).toHaveText('Kansas');
  await page.mouse.click(ks[0], ks[1]);
  await expect.poll(async () => (await units()).length).toBe(105);
  // districts: at-large states are named so
  page.once('dialog', (d) => d.accept());
  await page.selectOption('#subl', 'us-cd119');
  await expect.poll(units).toEqual([]);
  await page.selectOption('#subd', 'u');
  await rest(-107.5, 43.0);
  await expect(page.locator('#tip')).toHaveText('Wyoming (at-large)');
  // Puerto Rico has one layer (no Natural Earth subdivisions), so no menu, but its municipios paint
  await view([66.5, -18.2], 40);
  const pr = await rest(-66.45, 18.2);
  await expect(page.locator('#tip')).not.toHaveText(/Puerto Rico|^$/);
  await page.mouse.click(pr[0], pr[1]);
  await expect.poll(() => page.evaluate(() => window.ecumene.getState().u.flatMap((g) => g.k['Puerto Rico'] || []).length)).toBe(1);
  const svg = await page.evaluate(() => window.ecumene.svg());
  expect(svg).toContain('U.S. Census Bureau, 2024 cartographic boundary files. Public domain.');
  expect(errors).toEqual([]);
});

test('areas the subdivision data leaves out paint as "Rest of" the country', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    const s = window.ecumene.getState();
    Object.assign(s, { r: [-20, -60.2], z: 40, f: [], u: [] });
    window.ecumene.setState(s);
  });
  await mode(page, 'paint');
  await page.check('#sub');
  const box = await page.locator('#cv').boundingBox(),
    p = await page.evaluate(() => window.ecumene.px([19.99, 60.23])); // Finström, in the north of Åland's main island
  await page.mouse.move(box.x + p[0], box.y + p[1]);
  await page.mouse.move(box.x + p[0] + 1, box.y + p[1]);
  await expect(page.locator('#tip')).toHaveText('Rest of Åland');
  await page.mouse.click(box.x + p[0] + 1, box.y + p[1]);
  await expect.poll(() => page.evaluate(() => window.ecumene.getState().u)).toEqual([{ c: '#e4572e', k: { Åland: ['ALD+0'] }, l: '' }]);
  expect(errors).toEqual([]);
});

test('paste a list and paint a group', async ({ page }) => {
  const errors = await openApp(page);
  await mode(page, 'paint');
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
  await mode(page, 'data');
  await page.fill('#dd', 'France, 68\nGermany, 83\nSpain, 47\nItaly, 59\nBrazil, 12\nIndia, 30\nChina, 90\nKenya, 5\nAtlantis, 3');
  await page.click('#dgo');
  await expect(status(page)).toContainText('8 countries colored in 5 classes');
  await expect(page.locator('#lgd .lg')).toHaveCount(5);
  await expect(page.locator('#lgd .lg input[type=text]').first()).toHaveValue(/ to /);
  expect(errors).toEqual([]);
});

test('color schemes: diverging scale, paint sets, color-vision preview and clash warning', async ({ page }) => {
  const errors = await openApp(page);
  const fillOf = async (n) => (await page.evaluate(() => window.ecumene.getState().f)).find((g) => g.n.includes(n));
  // a diverging scale centred on 0: negatives red, positives blue, equal steps either side
  await mode(page, 'data');
  await page.selectOption('#dpal', 'Red-Blue');
  await expect(page.locator('#dcw')).toBeVisible();
  await expect(page.locator('#dm')).toBeDisabled();
  await expect(page.locator('#dpaln')).toHaveText('Color-blind safe, prints well.');
  await page.selectOption('#dn', '4');
  await page.fill('#dd', 'France, -6\nGermany, 6\nSpain, -2\nItaly, 2');
  await page.click('#dgo');
  expect((await fillOf('France')).c).toBe('#ca0020');
  expect((await fillOf('Germany')).c).toBe('#0571b0');
  expect((await fillOf('Spain')).l).toBe('-3 to 0');
  await page.check('#drev');
  await page.click('#dgo');
  expect((await fillOf('Germany')).c).toBe('#ca0020');
  // the Okabe–Ito paint colors
  await mode(page, 'paint');
  await page.selectOption('#pset', 'Okabe–Ito');
  await expect(page.locator('#pal .sw')).toHaveCount(8);
  await expect(page.locator('#psetn')).toHaveText('Color-blind safe.');
  // orange and green look alike with deuteranopia and protanopia: the legend panel says so, by label
  await page.evaluate(() => {
    const s = window.ecumene.getState();
    s.f = [
      { c: '#f2a541', n: ['France'], l: 'Founding members' },
      { c: '#7cc06b', n: ['Spain'], l: 'Joined later' },
    ];
    window.ecumene.setState(s);
  });
  await mode(page, 'legend');
  await expect(page.locator('#cvdw')).toBeVisible();
  await expect(page.locator('#cvdw')).toContainText('With deuteranopia (green-blind): Founding members and Joined later');
  await expect(page.locator('#cvdw')).toContainText('protanopia');
  // the preview changes the screen only
  await mode(page, 'style');
  await page.selectOption('#cvd', 'deuteranopia');
  expect(await page.evaluate(() => document.getElementById('cv').style.filter)).toContain('cvd-deuteranopia');
  const svg = await page.evaluate(() => window.ecumene.svg());
  expect(svg).toContain('fill="#f2a541"');
  expect(svg).not.toContain('cvd-');
  await page.selectOption('#cvd', '');
  expect(await page.evaluate(() => document.getElementById('cv').style.filter)).toBe('');
  // the paint set and data settings are saved with the map
  const st = await page.evaluate(() => window.ecumene.getState());
  expect(st.ps).toBe('Okabe–Ito');
  expect(st.ds).toEqual({ scale: 'Red-Blue', n: 4, m: 'equal', c: '', rev: true });
  await page.evaluate(() => {
    const s = window.ecumene.getState();
    delete s.ps;
    delete s.ds;
    window.ecumene.setState(s);
  });
  await expect(page.locator('#pset')).toHaveValue('Default');
  expect(errors).toEqual([]);
});

test('pattern fills: paint, draw on the globe, legend, SVG patterns, subdivisions and map codes', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    const s = window.ecumene.getState();
    Object.assign(s, { r: [-2.5, -46.5], z: 9, f: [], u: [] });
    window.ecumene.setState(s);
  });
  await mode(page, 'paint');
  // a plain color, then a pattern drawn on it
  await page.click('#pal .sw >> nth=3');
  await expect(page.locator('#ptn .sw')).toHaveCount(8);
  await page.click('#ptn .sw >> nth=0');
  const c = await globeCentre(page);
  await page.mouse.click(c.x, c.y);
  const fills = () => page.evaluate(() => window.ecumene.getState().f);
  await expect.poll(fills).toEqual([{ c: 'p:diag:#7cc06b:#222222', n: ['France'], l: '' }]);
  // the globe draws both the background and the ink around the centre of France (pointer away, so not hover-shaded)
  await page.mouse.move(2, 2);
  await page.waitForTimeout(600);
  const share = await page.evaluate(() => {
    const cv = document.getElementById('cv'),
      t = document.createElement('canvas');
    t.width = 60;
    t.height = 60;
    const x = t.getContext('2d');
    x.drawImage(cv, cv.width / 2 - 30, cv.height / 2 - 30, 60, 60, 0, 0, 60, 60);
    const d = x.getImageData(0, 0, 60, 60).data;
    let bg = 0,
      ink = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs(d[i] - 0x7c) + Math.abs(d[i + 1] - 0xc0) + Math.abs(d[i + 2] - 0x6b) < 40) bg++;
      if (d[i] + d[i + 1] + d[i + 2] < 150) ink++;
    }
    return { bg: bg / 3600, ink: ink / 3600 };
  });
  expect(share.bg).toBeGreaterThan(0.4);
  expect(share.ink).toBeGreaterThan(0.08);
  // the pattern color changes the active pattern
  await page.locator('#pink').evaluate((e) => {
    e.value = '#ffffff';
    e.dispatchEvent(new Event('input'));
  });
  await expect(page.locator('#ptn .sw.on')).toHaveCount(1);
  expect(await page.locator('#ptn .sw.on').getAttribute('data-c')).toBe('p:diag:#7cc06b:#ffffff');
  // legend: a preview of the pattern; a patterned subdivision too
  await page.evaluate(() => {
    const s = window.ecumene.getState();
    s.f[0].l = 'Hatched';
    s.u = [{ c: 'p:dots:#3d8bd9:#222222', k: { 'United Kingdom': ['GBR-2120'] }, l: 'Dotted' }];
    window.ecumene.setState(s);
  });
  await mode(page, 'legend');
  await expect(page.locator('#lgd .lgp')).toHaveCount(2);
  await expect.poll(() => page.evaluate(async () => (await window.ecumene.svg()).includes('data-name="York"'))).toBe(true);
  const svg = await page.evaluate(() => window.ecumene.svg());
  expect(svg).toContain('<pattern id="pat-diag-7cc06b-222222" patternUnits="userSpaceOnUse" width="8" height="8">');
  expect(svg).toMatch(/<path id="country-France" data-name="France"[^>]*fill="url\(#pat-diag-7cc06b-222222\)"/);
  expect(svg).toMatch(/data-name="York"[^>]*fill="url\(#pat-dots-3d8bd9-222222\)"/);
  // a map code keeps patterns; a broken pattern is ignored
  const code = await getCode(page);
  await page.evaluate(() => window.ecumene.setState(Object.assign(window.ecumene.getState(), { f: [], u: [] })));
  await useCode(page, code);
  expect((await fills())[0].c).toBe('p:diag:#7cc06b:#222222');
  await page.evaluate(() => {
    const s = window.ecumene.getState();
    s.f = [{ c: 'p:zigzag:#7cc06b:#222222', n: ['Spain'], l: '' }];
    window.ecumene.setState(s);
  });
  expect(await fills()).toEqual([]);
  expect(errors).toEqual([]);
});

test('legend editor: reorder, remove, title survive a map code', async ({ page }) => {
  const errors = await openApp(page);
  await mode(page, 'paint');
  await page.fill('#bl', 'France');
  await page.click('#blp');
  await page.locator('#pal .sw').nth(3).click();
  await page.fill('#bl', 'Peru');
  await page.click('#blp');
  await mode(page, 'legend');
  await page.locator('#lgd .lg input[type=text]').nth(0).fill('First');
  await page.locator('#lgd .lg input[type=text]').nth(1).fill('Second');
  await page.locator('#lgd .lg').nth(1).locator('button').nth(0).click(); // move up
  await expect(page.locator('#lgd .lg input[type=text]').first()).toHaveValue('Second');
  await page.fill('#lt', 'My legend');
  const code = await getCode(page);
  await mode(page, 'legend');
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
  await mode(page, 'draw');
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
  await mode(page, 'draw');
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
  await mode(page, 'paint');
  await page.fill('#bl', 'Japan');
  await page.click('#blp');
  await mode(page, 'draw');
  await page.click('#rgc');
  await expect(status(page)).toContainText('Exact outline made from 1 country');
  await expect(page.locator('#rgl .src')).toContainText('1 country: Japan');
  expect(errors).toEqual([]);
});

test('subdivision outlines: groups, list, map click, restore', async ({ page, browser }) => {
  test.setTimeout(600000);
  const errors = await openApp(page);
  await mode(page, 'draw');
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
  await mode(page, 'style');
  await page.selectOption('#pre', 'dark');
  await page.selectOption('#sfont', 'notoserif');
  const code = await getCode(page);
  await mode(page, 'style');
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
  // Lakes default to the major set; old saves stored true/false.
  expect(st.L.lakes).toBe('major');
  const lk = await page.evaluate(() => {
    const out = [];
    for (const v of [true, false, 'all', 'bogus']) {
      const s = window.ecumene.getState();
      s.L.lakes = v;
      window.ecumene.setState(s);
      out.push(window.ecumene.getState().L.lakes);
    }
    return out;
  });
  expect(lk).toEqual(['all', 'none', 'all', 'all']);
  await expect(page.locator('select[data-k=lakes]')).toHaveValue('all');
  await expect(page.locator('#lgd .lg input[type=text]')).toHaveValue('Andes');
  expect(await page.evaluate(() => window.ecumene.version)).toMatch(/^\d+\.\d+\.\d+$/);
  expect(errors).toEqual([]);
});

test('falls back to base64 data when .bin files are not served', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.route('**/*.bin', (route) => route.fulfill({ status: 404, body: 'not found' }));
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('load').hidden, null, { timeout: 120000 });
  await expect(page.locator('#st')).not.toContainText('failed');
  expect(await page.locator('#names option').count()).toBeGreaterThan(240);
  expect(pageErrors).toEqual([]);
});

test('SVG export is a valid vector map with a source note', async ({ page }) => {
  const errors = await openApp(page);
  await mode(page, 'paint');
  await page.fill('#bl', 'Brazil');
  await page.click('#blp');
  await mode(page, 'export');
  const dl = page.waitForEvent('download', { timeout: 120000 });
  await page.click('#exs');
  const d = await dl;
  expect(d.suggestedFilename()).toBe('globe-map.svg');
  const svg = require('fs').readFileSync(await d.path(), 'utf8');
  const info = await page.evaluate((text) => {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const brazil = doc.getElementById('country-Brazil');
    return {
      parseError: !!doc.querySelector('parsererror'),
      groups: [...doc.querySelectorAll('svg > g')].map((g) => g.id),
      brazilFill: brazil && brazil.getAttribute('fill'),
      note: doc.getElementById('source-note') ? doc.getElementById('source-note').textContent : '',
    };
  }, svg);
  expect(info.parseError).toBe(false);
  expect(info.groups).toEqual(expect.arrayContaining(['ocean', 'countries', 'borders', 'legend', 'source-note']));
  expect(info.brazilFill).toBe(await page.evaluate(() => window.ecumene.getState().f[0].c));
  expect(info.note).toContain('Natural Earth');
  expect(svg).toContain('<desc>Made with Ecumene');
  expect(svg.length).toBeLessThan(6e6);
  // turning the note off removes it
  await page.uncheck('#snote');
  expect(await page.evaluate(async () => (await window.ecumene.svg()).includes('id="source-note"'))).toBe(false);
  expect(errors).toEqual([]);
});

test('flat projections export with the right shape and a described projection', async ({ page }) => {
  const errors = await openApp(page);
  const r = await page.evaluate(async () => {
    const out = {};
    for (const proj of ['equalearth', 'robinson', 'winkel3', 'mercator']) {
      const svg = await window.ecumene.svg({ proj, area: 'world', width: 1000 });
      const m = /width="(\d+)" height="(\d+)"/.exec(svg);
      out[proj] = { w: +m[1], h: +m[2], desc: /<desc>([^<]*)<\/desc>/.exec(svg)[1] };
    }
    const s = window.ecumene.getState();
    s.r = [-15, -50];
    s.z = 3;
    window.ecumene.setState(s);
    const lcc = await window.ecumene.svg({ proj: 'lcc', area: 'screen', width: 800 });
    out.lcc = { desc: /<desc>([^<]*)<\/desc>/.exec(lcc)[1], shade: lcc.includes('id="shading"') };
    return out;
  });
  expect(r.equalearth.w).toBe(1000);
  expect(r.equalearth.h / r.equalearth.w).toBeGreaterThan(0.45);
  expect(r.equalearth.h / r.equalearth.w).toBeLessThan(0.55);
  expect(r.robinson.desc).toContain('Projection: Robinson, central meridian');
  expect(r.mercator.h).toBeGreaterThan(r.equalearth.h);
  expect(r.lcc.desc).toMatch(/Lambert conformal conic, standard parallels [\d.]+°N and [\d.]+°N/);
  expect(r.lcc.shade).toBe(false);
  expect(errors).toEqual([]);
});

test('Wikipedia preset sets the locator-map conventions and the preview opens', async ({ page }) => {
  const errors = await openApp(page);
  await mode(page, 'style');
  await page.selectOption('#pre', 'wikipedia');
  const st = await page.evaluate(() => window.ecumene.getState());
  expect(st.s).toMatchObject({ land: '#b9b9b9', water: '#ffffff', border: '#ffffff', rim: '#aaaaaa' });
  expect(st.L.grat).toBe(true);
  await expect(page.locator('#xproj')).toHaveValue('ortho');
  await expect(page.locator('#xarea')).toHaveValue('world');
  await expect(page.locator('#xw')).toHaveValue('550');
  await expect(page.locator('#snote')).not.toBeChecked();
  await expect(page.locator('#cc')).toHaveValue('#346733');
  await mode(page, 'export');
  await page.click('#xprev');
  await expect(page.locator('#xdlg')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('#xinfo')).toContainText('550 × 550');
  await page.click('#xclose');
  // regional projections can only fit the screen area
  await page.selectOption('#xproj', 'lcc');
  await expect(page.locator('#xarea')).toHaveValue('screen');
  expect(errors).toEqual([]);
});

test('PNG export downloads an image', async ({ page }) => {
  const errors = await openApp(page);
  await mode(page, 'paint');
  await page.fill('#bl', 'Brazil');
  await page.click('#blp');
  const dl = page.waitForEvent('download', { timeout: 200000 });
  await page.evaluate(() => document.getElementById('exp').click());
  const d = await dl;
  expect(d.suggestedFilename()).toBe('globe-map.png');
  expect(errors).toEqual([]);
});
