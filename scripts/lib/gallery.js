// The example gallery: site/examples/gallery.json lists the examples (title, caption, how it was made, source); the
// build turns it into the home page's featured cards and the gallery page (dist/gallery/index.html). A caption can
// name the date its data was read, filled in from the example's saved map: {fetched} (a statistic's fetch date),
// {year} (its year) and {read} (when a table of your own data was read). The build stops if one has no such date.
const fs = require('fs'),
  path = require('path');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 2026-10-14 -> 14 Oct 2026 */
const day = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '';
  return +m[3] + ' ' + MONTHS[+m[2] - 1] + ' ' + m[1];
};

/** The examples, with their captions' dates filled in from the saved maps in dir (site/examples). */
function loadExamples(dir) {
  const list = JSON.parse(fs.readFileSync(path.join(dir, 'gallery.json'), 'utf8'));
  const names = new Set();
  return list.map((e) => {
    for (const k of ['name', 'title', 'desc', 'how', 'source', 'alt'])
      if (!e[k]) throw new Error('gallery.json: ' + (e.name || '?') + ' has no ' + k);
    if (names.has(e.name)) throw new Error('gallery.json: ' + e.name + ' is listed twice');
    names.add(e.name);
    for (const f of [e.name + '.json', e.name + '.webp'])
      if (!fs.existsSync(path.join(dir, f)))
        throw new Error('gallery.json: ' + e.name + ': ' + f + ' is missing; run scripts/make_examples.js ' + e.name);
    const map = JSON.parse(fs.readFileSync(path.join(dir, e.name + '.json'), 'utf8'));
    const fill = {
      fetched: map.st && map.st.t ? day(map.st.t) : '',
      year: map.st && Number.isInteger(map.st.y) ? String(map.st.y) : '',
      read: map.im && map.im.t ? day(map.im.t) : '',
    };
    const desc = e.desc.replace(/\{(\w+)\}/g, (m, k) => {
      if (!fill[k]) throw new Error('gallery.json: ' + e.name + ': its map has nothing to fill ' + m);
      return fill[k];
    });
    return { ...e, desc, featured: !!e.featured };
  });
}

/** One card. prefix leads to the site's root ('' on the home page, '../' in the gallery); full adds how and source. */
function card(e, prefix, full) {
  return (
    '<a href="' +
    prefix +
    'app/?example=' +
    esc(e.name) +
    '"><img src="' +
    prefix +
    'examples/' +
    esc(e.name) +
    '.webp" alt="' +
    esc(e.alt) +
    '" width="800" height="500" loading="lazy">' +
    '<p class="ct">' +
    esc(e.title) +
    '</p><p class="cd">' +
    esc(e.desc) +
    '</p>' +
    (full ? '<p class="hw"><span>How:</span> ' + esc(e.how) + '</p><p class="hw"><span>Source:</span> ' + esc(e.source) + '</p>' : '') +
    '</a>'
  );
}
/** The home page with its featured cards in place of <!-- examples --> and the gallery link in place of <!-- gallery-link --> */
function homeWithExamples(html, examples) {
  for (const m of ['<!-- examples -->', '<!-- gallery-link -->'])
    if (!html.includes(m)) throw new Error('src/home/index.html has no ' + m + ' marker');
  const featured = examples.filter((e) => e.featured);
  return html
    .replace('<!-- examples -->', featured.map((e) => card(e, '', false)).join('\n'))
    .replace(
      '<!-- gallery-link -->',
      '<p class="more"><a href="gallery/">See all ' +
        examples.length +
        ' example maps, with how each was made and where its data comes from</a></p>',
    );
}
/** The gallery page: the home page's styles (with font paths one level up) and every card. */
function galleryPage(template, homeHtml, examples) {
  const css = (/<style>([\s\S]*?)<\/style>/.exec(homeHtml) || [])[1];
  if (!css) throw new Error('the home page has no <style> to share with the gallery');
  return template
    .replace('/* HOME_CSS */', css.replace(/url\(fonts\//g, 'url(../fonts/'))
    .replace('<!-- cards -->', examples.map((e) => card(e, '../', true)).join('\n'))
    .replace(/\{count\}/g, String(examples.length));
}

module.exports = { loadExamples, card, homeWithExamples, galleryPage, day };
