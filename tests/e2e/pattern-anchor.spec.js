// Patterns stay fixed to the land when the globe turns: they move with the country, and they tilt with it when it is
// drawn away from the centre of the globe, instead of staying still or upright on the screen.
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

// The checker pattern ("check") is 6 CSS-pixel squares laid out from the country's anchor along the country's own east
// and south as drawn on the screen, so the centres of the squares around the anchor must alternate colours.
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
    const g = window.ecumene.patternAnchor('France'),
      a = window.ecumene.px(g),
      b = window.ecumene.px([g[0], g[1] + 0.01]);
    // north on the screen (y down), then east and south from it
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]),
      n = [(b[0] - a[0]) / len, (b[1] - a[1]) / len],
      east = [-n[1], n[0]],
      south = [-n[0], -n[1]];
    const even = new Set(),
      odd = new Set();
    for (let i = -3; i < 3; i++)
      for (let j = -3; j < 3; j++) {
        const u = 6 * (i + 0.5),
          v = 6 * (j + 0.5),
          px = a[0] + east[0] * u + south[0] * v,
          py = a[1] + east[1] * u + south[1] * v;
        const d = x.getImageData(Math.floor(px * k), Math.floor(py * k), 1, 1).data;
        // ink (#222222) or background (#e4572e); the globe's shading moves colours by a step or two, so compare by tone
        ((i + j) % 2 === 0 ? even : odd).add(d[0] < 128 ? 'ink' : 'background');
      }
    return { even: [...even], odd: [...odd], tilt: Math.round((Math.atan2(n[0], -n[1]) * 180) / Math.PI) };
  });

test('a pattern stays fixed to the country while the globe is dragged', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    const s = window.ecumene.getState();
    s.f = [{ c: 'p:check:#e4572e:#222222', n: ['France'], l: '' }];
    s.r = [-2, -46.5];
    s.z = 3;
    window.ecumene.setState(s);
  });
  const tilts = [];
  // drag positions near the centre, then views where France is far from the centre and drawn tilted
  for (const [r, z] of [
    [[-2, -46.5], 3],
    [[-0.73, -45.61], 3],
    [[-3.37, -47.29], 3],
    [[1.11, -46.02], 3],
    [[-30, -25], 2.5],
    [[28, -32], 2.5],
    [[-15, -72], 2.5],
  ]) {
    await page.evaluate(
      ([r, z]) => {
        const s = window.ecumene.getState();
        s.r = r;
        s.z = z;
        window.ecumene.setState(s);
      },
      [r, z],
    );
    const c = await checkerAroundAnchor(page);
    tilts.push(c.tilt);
    // each set of squares is one colour, and the two sets differ: the squares sit where the country's anchor and its
    // north say, not where the screen does
    expect(c.even.length, 'view ' + r).toBe(1);
    expect(c.odd.length, 'view ' + r).toBe(1);
    expect(c.even[0], 'view ' + r).not.toBe(c.odd[0]);
  }
  // the far views really do tilt France on the screen, so the test checks the turning
  expect(Math.max(...tilts.map(Math.abs))).toBeGreaterThan(15);
  expect(errors).toEqual([]);
});
