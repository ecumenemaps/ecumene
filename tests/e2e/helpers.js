const { expect } = require('@playwright/test');
// Open the app and wait until data is decoded. Collects page errors (font CDN failures are ignored).
async function openApp(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.g|ERR_TUNNEL|ERR_NAME|ERR_INTERNET|net::ERR/.test(m.text())) errors.push(m.text());
  });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('load').hidden, null, { timeout: 120000 });
  await expect(page.locator('#st')).not.toContainText('failed');
  return errors;
}
const status = (page) => page.locator('#st');
async function globeCentre(page) {
  const b = await page.locator('#cv').boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
// Map code round trip: returns the code string from the Get code button.
async function getCode(page) {
  await page.click('#gc');
  await expect(page.locator('#mc')).toHaveValue(/^GM1\./);
  return page.locator('#mc').inputValue();
}
async function useCode(page, code) {
  await page.fill('#mc', code);
  await page.click('#uc');
  await expect(status(page)).toContainText(/loaded/i);
}
async function regionRows(page) {
  return page.locator('#rgl .rg-row').count();
}
module.exports = { openApp, status, globeCentre, getCode, useCode, regionRows };
