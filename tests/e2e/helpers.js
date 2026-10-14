const { expect } = require('@playwright/test');
// Open the app and wait until data is decoded. Collects page errors (font CDN failures are ignored).
async function openApp(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.g|ERR_TUNNEL|ERR_NAME|ERR_INTERNET|net::ERR/.test(m.text())) errors.push(m.text());
  });
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('load').hidden, null, { timeout: 120000 });
  await expect(page.locator('#st')).not.toContainText('failed');
  return errors;
}
const status = (page) => page.locator('#st');
async function globeCentre(page) {
  const b = await page.locator('#cv').boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
// Show one panel mode (paint, data, draw, style, legend, export) without toggling it closed.
const mode = (page, m) => page.evaluate((x) => window.ecumene.mode(x), m);
// Map code round trip: returns the code string from the Get code button.
async function getCode(page) {
  await mode(page, 'export');
  await page.click('#gc');
  await expect(page.locator('#mc')).toHaveValue(/^GM1\./);
  return page.locator('#mc').inputValue();
}
async function useCode(page, code) {
  await mode(page, 'export');
  await page.fill('#mc', code);
  await page.click('#uc');
  await expect(status(page)).toContainText(/loaded/i);
}
async function regionRows(page) {
  return page.locator('#rgl .rg-row').count();
}
// The source line printed on an SVG export, as one text: it wraps onto several lines when it is too long for the frame
// (at its " · " separators, which are then dropped, or at spaces), so its lines are joined with spaces.
function sourceNote(svg) {
  const g = /<g id="source-note">([\s\S]*?)<\/g>/.exec(svg);
  if (!g) return '';
  const lines = [...g[1].matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => m[1]);
  // each line is drawn twice (a halo, then the text)
  return lines
    .filter((l, i) => i % 2 === 1)
    .join(' ')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
module.exports = { openApp, status, globeCentre, getCode, useCode, regionRows, mode, sourceNote };
