// Patterns move with the country when the globe turns, instead of staying still on the screen.
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

// The checker pattern ("check") is 6 CSS-pixel squares laid out from the country's anchor, so the centres of the
// squares around the anchor's position on screen must alternate colours, whatever the rotation.
const checkerAroundAnchor = (page) =>
  page.evaluate(async () => {
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    const cv = document.getElementById('cv'),
      k = cv.width / cv.clientWidth,
      c = document.createElement('canvas');
    c.width = cv.width;
    c.height = cv.height;
    const x = c.getContext('2d');
    x.drawImage(cv, 0, 0);
    const a = window.ecumene.px(window.ecumene.patternAnchor('France')),
      even = new Set(),
      odd = new Set();
    for (let i = -3; i < 3; i++)
      for (let j = -3; j < 3; j++) {
        const d = x.getImageData(Math.floor((a[0] + 6 * (i + 0.5)) * k), Math.floor((a[1] + 6 * (j + 0.5)) * k), 1, 1).data;
        // ink (#222222) or background (#e4572e); the globe's shading moves colours by a step or two, so compare by tone
        ((i + j) % 2 === 0 ? even : odd).add(d[0] < 128 ? 'ink' : 'background');
      }
    return { even: [...even], odd: [...odd] };
  });

test('a pattern stays on the country while the globe is dragged', async ({ page }) => {
  const errors = await openApp(page);
  // France in checkers, near the centre of the view
  await page.evaluate(() => {
    const s = window.ecumene.getState();
    s.f = [{ c: 'p:check:#e4572e:#222222', n: ['France'], l: '' }];
    s.r = [-2, -46.5];
    s.z = 3;
    window.ecumene.setState(s);
  });
  // several rotations, as a drag passes through them
  for (const r of [
    [-2, -46.5],
    [-0.73, -45.61],
    [-3.37, -47.29],
    [1.11, -46.02],
  ]) {
    await page.evaluate((r) => {
      const s = window.ecumene.getState();
      s.r = r;
      window.ecumene.setState(s);
    }, r);
    const c = await checkerAroundAnchor(page);
    // each set of squares is one colour, and the two sets differ: the squares sit where the anchor says
    expect(c.even.length, 'rotation ' + r).toBe(1);
    expect(c.odd.length, 'rotation ' + r).toBe(1);
    expect(c.even[0], 'rotation ' + r).not.toBe(c.odd[0]);
  }
  expect(errors).toEqual([]);
});
