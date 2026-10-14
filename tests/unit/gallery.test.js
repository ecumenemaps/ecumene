// The example gallery (site/examples, scripts/lib/gallery.js): every example is listed once with its files, captions
// are filled from the saved maps, and only the invented scenario is marked fictional.
const test = require('node:test'),
  assert = require('node:assert'),
  fs = require('fs'),
  path = require('path');
const G = require('../../scripts/lib/gallery.js');
const dir = path.join(__dirname, '..', '..', 'site', 'examples');

test('every example is listed with its map and thumbnail, and every map file is listed', () => {
  const ex = G.loadExamples(dir);
  assert.ok(ex.length >= 12, ex.length + ' examples');
  assert.strictEqual(ex.filter((e) => e.featured).length, 4, 'four featured on the home page');
  const listed = new Set(ex.map((e) => e.name));
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'gallery.json'))
    assert.ok(listed.has(f.slice(0, -5)), f + ' is not in gallery.json');
});

test('captions name the dates their data was read, and nothing is left unfilled', () => {
  for (const e of G.loadExamples(dir)) {
    assert.ok(!/[{}]/.test(e.desc), e.name + ': ' + e.desc);
    const map = JSON.parse(fs.readFileSync(path.join(dir, e.name + '.json'), 'utf8'));
    // data read from another site says when
    if (map.st && map.st.k === 'wb') assert.ok(e.desc.includes(G.day(map.st.t)), e.name + ' names its fetch date');
    if (map.im && map.im.src !== 'paste') assert.ok(e.desc.includes(G.day(map.im.t)), e.name + ' names when it was read');
  }
  assert.strictEqual(G.day('2026-10-14'), '14 Oct 2026');
});

test('only the invented scenario is marked fictional, and it says so in its caption', () => {
  for (const e of G.loadExamples(dir)) {
    const map = JSON.parse(fs.readFileSync(path.join(dir, e.name + '.json'), 'utf8'));
    const fictional = map.fi === true;
    assert.strictEqual(fictional, e.name === 'althist', e.name);
    assert.strictEqual(/fictional/i.test(e.desc), fictional, e.name + ' caption');
  }
});

test('cards escape their text; the home page and gallery are built from the list', () => {
  const card = G.card({ name: 'x', title: 'A & B <i>', desc: '"q"', how: 'h', source: 's', alt: 'a' }, '../', true);
  assert.ok(card.includes('A &amp; B &lt;i&gt;') && card.includes('&quot;q&quot;') && card.includes('href="../app/?example=x"'));
  const ex = G.loadExamples(dir);
  const home = G.homeWithExamples('<div class="plates">\n<!-- examples -->\n</div>\n<!-- gallery-link -->', ex);
  assert.strictEqual((home.match(/class="ct"/g) || []).length, 4);
  assert.ok(home.includes('href="gallery/"'));
  assert.throws(() => G.homeWithExamples('<div></div>', ex), /marker/);
  const page = G.galleryPage('<style>/* HOME_CSS */</style><p>{count}</p><!-- cards -->', '<style>a{src:url(fonts/x.woff2)}</style>', ex);
  assert.ok(page.includes('url(../fonts/x.woff2)'));
  assert.strictEqual((page.match(/class="ct"/g) || []).length, ex.length);
  assert.ok(page.includes('<p>' + ex.length + '</p>'));
});
