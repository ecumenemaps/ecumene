// The Paint panel's country groups show where their membership was checked.
const { test, expect } = require('@playwright/test');
const { openApp, mode } = require('./helpers');

test('a group shows its note, its source and the date it was checked', async ({ page }) => {
  const errors = await openApp(page);
  await mode(page, 'paint');
  await page.selectOption('#grp', { label: 'NATO (32)' });
  await expect(page.locator('#grpn')).toContainText("Membership checked against NATO's member countries page on 14 Oct 2026.");
  await page.selectOption('#grp', { label: 'G20 (19 countries)' });
  await expect(page.locator('#grpn')).toContainText('not single countries');
  await expect(page.locator('#grpn')).toContainText('Government of Canada');
  await page.selectOption('#grp', { label: 'Asia' });
  await expect(page.locator('#grpn')).toHaveText(/^Russia is counted in Europe/);
  expect(errors).toEqual([]);
});
