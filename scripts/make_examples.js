// Builds the example maps shown in the gallery and on the home page: site/examples/<name>.json (map state, opened by
// app/?example=<name>) and <name>.webp (thumbnail). Their titles, captions and sources are in site/examples/gallery.json.
// Uses the built editor, so run `npm run build` and `npm run serve` first. Some examples read live data (the World Bank,
// NATO's member table), so they need the network.
// Usage: node scripts/make_examples.js [name...]   (GPU=1 to render with the graphics card)
const { chromium } = require('@playwright/test');
const fs = require('fs'),
  path = require('path');
const R = (p) => path.join(__dirname, '..', p);
const BASE = process.env.BASE || 'http://127.0.0.1:8790/app/index.html';
// panel rail (68 px) + panel (320 px) + an 800 x 500 stage
const VIEW = { width: 1188, height: 500 };

const EXAMPLES = {
  // The 27 member states, in the Wikipedia locator style, centred on Europe.
  async eu(page) {
    await mode(page, 'style');
    await page.selectOption('#pre', 'wikipedia');
    await mode(page, 'paint');
    await page.selectOption('#grp', { label: 'European Union (27)' });
    await page.click('#grpp');
    await view(page, [-14, -50], 1);
    return { mode: 'paint', export: { proj: 'ortho', area: 'world', width: 550 } };
  },
  // World Bank GDP per capita, 2022, five quantile classes. The numbers are fetched from the World Bank's API while
  // the example is made (this needs the network) and saved in the example with the year and the date fetched, so
  // the example never changes by itself; run this script again to refresh it. The legend title and credit are the
  // editor's own.
  async gdp(page) {
    await mode(page, 'data');
    await page.selectOption('#dst', 'wb:NY.GDP.PCAP.CD');
    await page.waitForFunction(() => document.querySelector('#dyr option[value="2022"]') && !document.getElementById('dyr').disabled, null, { timeout: 60000 });
    await page.selectOption('#dyr', '2022');
    await page.selectOption('#dpal', 'Yellow-Green-Blue');
    await page.selectOption('#dn', '5');
    await page.selectOption('#dm', 'quantile');
    await page.click('#dgo');
    await view(page, [-10, 0], 1);
    return { mode: 'data', export: { proj: 'equalearth', area: 'world', width: 1600 } };
  },
  // A fictional scenario: regions and arrows over the eastern Mediterranean.
  async althist(page) {
    await view(page, [-28, -39.6], 4.6);
    await page.evaluate(() => {
      const s = window.ecumene.getState();
      s.lg = { t: 'A restored Byzantium, 1453 (fictional)', p: 'bl', s: true };
      s.fi = true; // exports say it is a fictional scenario (the Legend panel's checkbox)
      s.g = [
        { t: 'region', c: '#6a3d9a', o: 0.42, w: 2, l: 'Eastern Roman Empire', n: false, s: 15,
          p: [[19.6, 42.2], [22.4, 44.2], [28.6, 43.8], [29.2, 41.3], [31.8, 41.2], [31.6, 38.6], [30.5, 36.8], [28, 36.6], [26.3, 38.3], [24, 37.3], [21.6, 37], [19.9, 39.4]] },
        { t: 'region', c: '#b8860b', o: 0.4, w: 2, d: true, l: 'Karamanid beylik', n: true, s: 13,
          p: [[31.9, 40.9], [35.8, 41.3], [37, 38.8], [35.6, 36.6], [32.6, 36.2], [31.7, 38.6]] },
        { t: 'arrow', c: '#7a1f1f', aw: 3, l: 'Campaign of 1449', p: [[28.98, 41.01], [30.6, 39.6], [32.5, 37.87]] },
        { t: 'arrow', c: '#1f4e79', aw: 2.5, d: true, l: 'Venetian fleet', p: [[12.6, 45.2], [17, 40.5], [22, 36.3], [26.2, 39.8], [28.6, 40.9]] },
        { t: 'marker', c: '#ffd166', l: 'Constantinople', sy: 'star', ms: 6, s: 13, p: [[28.98, 41.01]] },
      ];
      window.ecumene.setState(s);
    });
    return { mode: 'draw', export: { proj: 'ortho', area: 'screen' } };
  },
  // England, Scotland, Wales and Northern Ireland as exact subdivision outlines.
  async uk(page) {
    await mode(page, 'draw');
    const cols = { England: '#c8553d', Scotland: '#2e6f95', Wales: '#3f8f4f', 'Northern Ireland': '#e0a83a' };
    for (const name of Object.keys(cols)) {
      await page.click('#a1o');
      await page.fill('#a1c', 'United Kingdom');
      await page.locator('#a1c').dispatchEvent('change');
      await page.locator('#a1l label').first().waitFor();
      await page.waitForTimeout(900); // the globe turns to the country
      console.log('  outline', name);
      // DOM clicks: the short example viewport keeps the panel scrolling under the pointer
      await page.locator('#a1g .chip', { hasText: new RegExp('^' + name + ' \\(') }).first().evaluate((b) => b.click());
      await page.locator('#a1ok').evaluate((b) => b.click());
    }
    await page.evaluate((cols) => {
      const s = window.ecumene.getState();
      for (const g of s.g) {
        g.c = cols[g.l] || g.c;
        g.o = 0.8;
        g.w = 1.2;
        g.n = true;
        g.s = 14;
      }
      s.lg = { t: 'Countries of the United Kingdom', p: 'tl', s: true };
      window.ecumene.setState(s);
    }, cols);
    await view(page, [3.2, -54.4], 8.2);
    return { mode: 'draw', export: { proj: 'lcc', area: 'screen', width: 800 } };
  },
  // Electoral votes per state (2020 apportionment, checked against the Census table): a statistic, five classes.
  async electoral(page) {
    // three equal classes give whole-number edges (3 to 20, 20 to 37, 37 to 54)
    await statistic(page, 'ev', null, 'Purples', 'equal', 3);
    await view(page, [98, -38.5], 2.35);
    return { mode: 'data', export: { proj: 'lcc', area: 'screen', width: 800 } };
  },
  // Life expectancy at birth, the latest year with good coverage, fetched from the World Bank and saved with its date.
  async lifeexp(page) {
    await statistic(page, 'wb:SP.DYN.LE00.IN', 'auto', 'Greens');
    await view(page, [-10, 0], 1);
    return { mode: 'data', export: { proj: 'robinson', area: 'world', width: 1600 } };
  },
  // Under-5 mortality in Viridis, a color-blind safe scale; quantiles, so each class holds a fifth of the countries.
  async mortality(page) {
    await statistic(page, 'wb:SH.DYN.MORT', 'auto', 'Viridis', 'quantile');
    await view(page, [-10, 0], 1);
    return { mode: 'data', export: { proj: 'equalearth', area: 'world', width: 1600 } };
  },
  // NATO members by the period they joined in: the join years are read from NATO's own member table (the page that
  // scripts/check_groups.js checks the NATO group against) and pasted as a table of words, which become categories.
  async nato(page) {
    const html = await (await fetch('https://www.nato.int/en/about-us/organization/nato-member-countries', { headers: { 'user-agent': 'Mozilla/5.0 ecumene-examples' } })).text();
    const t = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
    const a = t.indexOf('Albania 2009'),
      b = t.indexOf('United States 1949', a);
    if (a < 0 || b < 0) throw new Error('NATO page: the member table was not found');
    const rows = [...t.slice(a, b + 18).matchAll(/([A-Za-zÀ-ɏ][A-Za-zÀ-ɏ ]*?) ((?:19|20)\d{2})/g)].map((m) => [m[1].trim(), +m[2]]);
    if (rows.length !== 32) throw new Error('NATO page: expected 32 members, found ' + rows.length);
    const period = (y) => (y === 1949 ? 'Founding members, 1949' : y <= 1982 ? 'Joined 1952 to 1982' : y <= 2009 ? 'Joined 1999 to 2009' : 'Joined 2017 to 2024');
    rows.sort((x, y) => x[1] - y[1]);
    await mode(page, 'paint');
    await page.selectOption('#pset', 'Okabe–Ito');
    await mode(page, 'data');
    await page.fill('#dd', 'Country\tWhen it joined\n' + rows.map(([n, y]) => n + '\t' + period(y)).join('\n'));
    await page.fill('#dsrc', 'NATO, member countries (nato.int)');
    // countries that are not members are not missing data: they stay unpainted
    await page.uncheck('#dnd');
    await page.click('#dgo');
    await page.waitForFunction(() => /32 countries colored/.test(document.getElementById('st').textContent), null, { timeout: 30000 });
    await page.evaluate(() => {
      const s = window.ecumene.getState();
      s.lg.t = 'NATO members, by when they joined';
      window.ecumene.setState(s);
    });
    await view(page, [30, -48], 1);
    return { mode: 'data', export: { proj: 'ortho', area: 'world', width: 550 } };
  },
  // The euro area inside the EU: members from the checked groups (src/groups.js), the rest of the EU hatched.
  async euro(page) {
    const eu = Ecu.GROUPS['European Union (27)'],
      ez = new Set(Ecu.GROUPS['Eurozone (21)']);
    await page.evaluate(
      ({ inEuro, other }) => {
        const s = window.ecumene.getState();
        s.f = [
          { c: '#0072b2', n: inEuro, l: 'Euro area (21)' },
          { c: 'p:diag:#cfe3f3:#0072b2', n: other, l: 'EU, other currency (6)' },
        ];
        s.lg = { t: 'The euro area within the European Union', p: 'bl', s: true };
        window.ecumene.setState(s);
      },
      { inEuro: eu.filter((n) => ez.has(n)), other: eu.filter((n) => !ez.has(n)) },
    );
    await view(page, [-14, -50], 1);
    return { mode: 'paint', export: { proj: 'ortho', area: 'world', width: 550 } };
  },
  // Continents as in the UN M49 classification (src/groups.js), one Okabe–Ito color each.
  async continents(page) {
    const names = Object.keys(Ecu.CONTINENTS),
      cols = ['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7'];
    await page.evaluate(
      ({ names, cols, lists }) => {
        const s = window.ecumene.getState();
        s.ps = 'Okabe–Ito';
        s.f = names.map((n, i) => ({ c: cols[i], n: lists[i], l: n }));
        s.lg = { t: 'Continents (UN M49)', p: 'bl', s: true };
        window.ecumene.setState(s);
      },
      { names, cols, lists: names.map((n) => Ecu.CONTINENTS[n]) },
    );
    await view(page, [-10, 0], 1);
    return { mode: 'paint', export: { proj: 'robinson', area: 'world', width: 1600 } };
  },
  // Texas's 254 counties, from the US counties layer (Census Bureau, 2024). Painted subdivisions have no lines between
  // them, so neighbouring counties get different colors (a greedy coloring over the layer's shared borders).
  async texas(page) {
    const idx = JSON.parse(fs.readFileSync(R('data/layers/index.json'), 'utf8'));
    const t = JSON.parse(fs.readFileSync(R('data/layers/' + idx['United States of America'].find((x) => x.id === 'us-counties-2024').f), 'utf8'));
    const geoms = t.objects.u.geometries,
      nb = require('topojson-client').neighbors(geoms),
      cols = ['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#cc79a7', '#0072b2', '#d55e00'],
      colour = new Map();
    // counties with most neighbours first, each taking the first color none of its neighbours has
    const order = geoms
      .map((g, i) => i)
      .filter((i) => geoms[i].properties.g === 'Texas')
      .sort((a, b) => nb[b].length - nb[a].length);
    for (const i of order) {
      const used = new Set(nb[i].map((j) => colour.get(j)).filter(Boolean));
      const c = cols.find((x) => !used.has(x));
      if (!c) throw new Error('Texas: ' + cols.length + ' colors were not enough for ' + geoms[i].properties.n);
      colour.set(i, c);
    }
    console.log('  texas: ' + order.length + ' counties in ' + new Set(colour.values()).size + ' colors');
    const byCode = new Map([...colour].map(([i, c]) => [geoms[i].properties.c, c]));
    await paintLayer(page, 'United States of America', 'us-counties-2024', (p) => byCode.get(p.c) || null, {});
    await page.evaluate(() => {
      const s = window.ecumene.getState();
      s.lg.s = false; // the colors only tell neighbours apart, so no legend
      window.ecumene.setState(s);
    });
    await view(page, [99.3, -31.2], 7.5);
    return { mode: 'paint', export: { proj: 'lcc', area: 'screen', width: 800 } };
  },
  // Ireland's 26 counties by province, from the counties layer (Tailte Éireann).
  async ireland(page) {
    const by = { Connacht: '#e69f00', Leinster: '#56b4e9', Munster: '#009e73', Ulster: '#cc79a7' };
    await paintLayer(page, 'Ireland', 'ie-counties-2019', (p) => by[p.r] || null, Object.fromEntries(Object.entries(by).map(([k, v]) => [v, k])));
    await page.evaluate(() => {
      const s = window.ecumene.getState();
      s.lg.t = "Ireland's four provinces";
      window.ecumene.setState(s);
    });
    await view(page, [8, -53.4], 11);
    return { mode: 'paint', export: { proj: 'lcc', area: 'screen', width: 800 } };
  },
};

const Ecu = require('../src/groups.js');
/** Color by a statistic in the Data panel: choose it, pick the year ('auto' = the default) and the scale. */
async function statistic(page, value, year, scale, method = 'equal', classes = 5) {
  await mode(page, 'data');
  await page.selectOption('#dst', value);
  if (year) {
    await page.waitForFunction(() => !document.getElementById('dyr').disabled && document.querySelector('#dyr option[value="auto"]'), null, { timeout: 60000 });
    await page.selectOption('#dyr', year);
  }
  await page.selectOption('#dpal', scale);
  await page.selectOption('#dn', String(classes));
  await page.selectOption('#dm', method);
  await page.click('#dgo');
  await page.waitForFunction(() => window.ecumene.getState().st, null, { timeout: 60000 });
}
/** Paint the units of one layer of a country: paintOf(properties) gives each unit's paint or null; labels by paint. */
async function paintLayer(page, country, layer, paintOf, labels) {
  const units = await page.evaluate(
    async ({ country, layer }) => {
      const idx = await (await fetch('layers/index.json')).json();
      const t = await (await fetch('layers/' + idx[country].find((x) => x.id === layer).f)).json();
      return t.objects.u.geometries.map((g) => g.properties);
    },
    { country, layer },
  );
  const groups = {};
  for (const p of units) {
    const c = paintOf(p);
    if (c) (groups[c] = groups[c] || []).push(layer + ':' + p.c);
  }
  await page.evaluate(
    ({ country, groups, labels }) => {
      const s = window.ecumene.getState();
      s.u = Object.entries(groups).map(([c, codes]) => ({ c, k: { [country]: codes }, l: labels[c] || '' }));
      s.lg = { t: '', p: 'bl', s: true };
      window.ecumene.setState(s);
    },
    { country, groups, labels },
  );
  await page.evaluate((c) => window.ecumene.loadUnits(c), country);
}

const mode = (page, m) => page.evaluate((x) => window.ecumene.mode(x), m);
const view = (page, r, z) =>
  page.evaluate(
    ([r, z]) => {
      const s = window.ecumene.getState();
      s.r = r;
      s.z = z;
      window.ecumene.setState(s);
    },
    [r, z],
  );
const setLegend = (page, lg) =>
  page.evaluate((lg) => {
    const s = window.ecumene.getState();
    Object.assign(s.lg, lg);
    window.ecumene.setState(s);
  }, lg);

(async () => {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(EXAMPLES);
  // GPU=1 uses the machine's graphics card (much faster for the county maps); otherwise the software renderer
  const browser = await chromium.launch(
    process.env.GPU
      ? { channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] }
      : { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  );
  fs.mkdirSync(R('site/examples'), { recursive: true });
  for (const name of names) {
    const page = await browser.newPage({ viewport: VIEW });
    page.on('pageerror', (e) => console.error(name, e.message));
    await page.goto(BASE + '?new', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.ecumene && document.getElementById('load').hidden, null, { timeout: 180000 });
    await page.waitForTimeout(1500);
    const meta = await EXAMPLES[name](page);
    await page.waitForTimeout(800);
    const state = await page.evaluate(() => window.ecumene.getState());
    state.mode = meta.mode;
    state.x = meta.export;
    fs.writeFileSync(R('site/examples/' + name + '.json'), JSON.stringify(state));
    // thumbnail: the export, drawn to fit an 8:5 frame on the map's background colour, at 2x
    const webp = await page.evaluate(async (opts) => {
      const svg = await window.ecumene.svg(opts);
      const m = /width="(\d+)" height="(\d+)"/.exec(svg),
        w = +m[1],
        h = +m[2];
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const img = new Image();
      img.src = url;
      await img.decode();
      const W = 1600,
        H = 1000,
        k = Math.min(W / w, H / h);
      const cv = document.createElement('canvas');
      cv.width = W;
      cv.height = H;
      const c = cv.getContext('2d');
      c.fillStyle = window.ecumene.getState().s.bg;
      c.fillRect(0, 0, W, H);
      c.drawImage(img, (W - w * k) / 2, (H - h * k) / 2, w * k, h * k);
      URL.revokeObjectURL(url);
      return cv.toDataURL('image/webp', 0.86);
    }, meta.export);
    fs.writeFileSync(R('site/examples/' + name + '.webp'), Buffer.from(webp.split(',')[1], 'base64'));
    console.log(name, (fs.statSync(R('site/examples/' + name + '.webp')).size / 1024).toFixed(0) + ' KB thumbnail, state ' + (JSON.stringify(state).length / 1024).toFixed(0) + ' KB');
    await page.close();
  }
  await browser.close();
})();
