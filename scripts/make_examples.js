// Builds the example maps shown on the home page: site/examples/<name>.json (map state, opened by
// app/?example=<name>) and <name>.webp (thumbnail). Uses the built editor, so run `npm run build`
// and `npm run serve` first. Usage: node scripts/make_examples.js [name...]
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
  // World Bank GDP per capita, 2022, five quantile classes.
  async gdp(page) {
    const rows = fs.readFileSync(R('site/data/gdp-per-capita-2022.csv'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).join('\n');
    await mode(page, 'data');
    await page.fill('#dd', rows);
    await page.selectOption('#dpal', 'Yellow-Green-Blue');
    await page.selectOption('#dn', '5');
    await page.selectOption('#dm', 'quantile');
    await page.click('#dgo');
    await setLegend(page, { t: 'GDP per capita, 2022 (current US$, World Bank)', p: 'bl' });
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
};

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
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
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
