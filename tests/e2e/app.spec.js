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
  expect(st.f[0].n.length).toBe(27);
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
