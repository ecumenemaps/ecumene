// Color vision: a screen-only preview of the map with a color-vision deficiency (Style panel) and a warning in the
// Legend panel when two of the map's colors look alike with one. Both use the matrices in schemes.js; the preview is
// an SVG color-matrix filter on the globe and overlay canvases, so exports are never affected.
import { app, on } from './store.js';
import { shownColours } from './paint.js';
import { CVD, CVD_NAMES, clashes } from './schemes.js';
import { $, el } from './util.js';
import { isPattern } from './patterns.js';

const NS = 'http://www.w3.org/2000/svg';
function addFilters() {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0';
  for (const [type, M] of Object.entries(CVD)) {
    const f = document.createElementNS(NS, 'filter'),
      m = document.createElementNS(NS, 'feColorMatrix');
    f.id = 'cvd-' + type;
    // the matrices are for linear RGB, which is what filters work in
    f.setAttribute('color-interpolation-filters', 'linearRGB');
    m.setAttribute('type', 'matrix');
    m.setAttribute('values', [M[0], M[1], M[2], 0, 0, M[3], M[4], M[5], 0, 0, M[6], M[7], M[8], 0, 0, 0, 0, 0, 1, 0].join(' '));
    f.append(m);
    svg.append(f);
  }
  document.body.append(svg);
}
/** Show the map on screen as seen with app.cvd ('' for normal vision). */
export function applyPreview() {
  const f = app.cvd && CVD[app.cvd] ? 'url(#cvd-' + app.cvd + ')' : '';
  for (const id of ['cv', 'ov']) $(id).style.filter = f;
}

const SHORT = { deuteranopia: 'deuteranopia (green-blind)', protanopia: 'protanopia (red-blind)', tritanopia: 'tritanopia (blue-blind)' };
/** The Legend panel's warning about colors that look alike with a color-vision deficiency. */
function warn() {
  // patterned entries are told apart by their pattern, so only plain colors are compared
  const w = $('cvdw'),
    cols = shownColours().filter((c) => !isPattern(c)),
    found = clashes(cols);
  w.hidden = !found.length;
  if (!found.length) return;
  const name = (c) => (app.labels[c] && app.labels[c].trim()) || c;
  const byType = new Map();
  for (const x of found) (byType.get(x.type) || byType.set(x.type, []).get(x.type)).push(name(x.a) + ' and ' + name(x.b));
  w.replaceChildren(
    'Some colors look alike with a color-vision deficiency. ',
    ...[...byType].map(([t, pairs]) =>
      el('span', {
        textContent:
          'With ' +
          SHORT[t] +
          ': ' +
          pairs.slice(0, 3).join('; ') +
          (pairs.length > 3 ? ' and ' + (pairs.length - 3) + ' more' : '') +
          '. ',
      }),
    ),
    'The Okabe–Ito paint colors, or a color-blind safe scale, avoid this; Style > Color vision previews it.',
  );
}

export function initVision() {
  addFilters();
  const sel = $('cvd');
  sel.append(...Object.entries(CVD_NAMES).map(([v, t]) => el('option', { value: v, textContent: t })));
  sel.onchange = () => {
    app.cvd = sel.value;
    applyPreview();
  };
  on('legend', warn);
  on('history', warn);
  warn();
}
