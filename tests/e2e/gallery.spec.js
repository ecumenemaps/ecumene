// The example gallery: the page loads nothing from other sites, the home page links to it, and every example opens
// in the editor without errors and credits its data in the SVG export.
const { test, expect } = require('@playwright/test');
const examples = require('../../site/examples/gallery.json');

test('the gallery page lists every example and loads nothing from other sites', async ({ page, baseURL }) => {
  const hosts = new Set();
  page.on('request', (r) => hosts.add(new URL(r.url()).host));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/gallery/', { waitUntil: 'networkidle' });
  await expect(page.locator('.plates a')).toHaveCount(examples.length);
  await expect(page.locator('h1')).toHaveText('Example maps');
  // each card says how it was made and where its data comes from
  await expect(page.locator('.plates .hw')).toHaveCount(2 * examples.length);
  expect([...hosts]).toEqual([new URL(baseURL).host]);
  // the home page shows the featured ones and links here
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.plates a')).toHaveCount(examples.filter((e) => e.featured).length);
  await page.click('a[href="gallery/"]');
  await expect(page).toHaveURL(/\/gallery\/$/);
  expect(errors).toEqual([]);
});

for (const e of examples)
  test('example ' + e.name + ' opens in the editor and credits its data', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (x) => errors.push(x.message));
    // no request leaves the site: examples carry their data, nothing is fetched again
    const outside = [];
    page.on('request', (r) => {
      if (!/^https?:\/\/127\.0\.0\.1/.test(r.url()) && !/^(data|blob):/.test(r.url())) outside.push(r.url());
    });
    await page.goto('/app/index.html?example=' + e.name, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.ecumene && document.getElementById('load').hidden, null, { timeout: 120000 });
    const s = await page.evaluate(() => window.ecumene.getState());
    expect(s.f.length + s.u.length + s.g.length).toBeGreaterThan(0);
    const svg = await page.evaluate(() => window.ecumene.svg());
    expect(svg).toContain('Natural Earth');
    if (s.st && s.st.k === 'wb') expect(svg).toContain('World Bank, World Development Indicators');
    if (s.st && s.st.k === 'ev') expect(svg).toContain('U.S. Census Bureau');
    if (s.im) expect(svg).toContain(s.im.credit);
    if (e.name === 'althist') expect(svg).toContain('Fictional scenario');
    else expect(svg).not.toContain('Fictional scenario');
    expect(outside).toEqual([]);
    expect(errors).toEqual([]);
  });
