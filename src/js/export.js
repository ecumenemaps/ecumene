// Exports: PNG (re-render the globe at the requested scale and composite the 2D layers on top) and
// SVG (the same map as vector layers), both with an optional source note.
import { geoPath, geoArea } from 'd3-geo';
import { mesh } from 'topojson-client';
import { app, redraw, VERSION } from './store.js';
import { render, RIVER_MIN_ZOOM, RIVER_WIDTH } from './gl.js';
import { geo } from './data.js';
import { Rb, withProjection, tinyMarkers, MARK_R } from './view.js';
import { exportView } from './projections.js';
import { unitByKey, splitKey, layerOfCode, loadPainted } from './units.js';
import { drawTinyMarkers, markerPaint, drawObjects, drawObjectLabels, drawCountryNames, drawLegend, drawSourceNote } from './overlay.js';
import { SvgContext, esc } from './svgctx.js';
import { fillWith, baseColor } from './patterns.js';
import { statCredit } from './statsrc.js';
import { lakePolygons, prepareLakes, cutLakes } from '../../scripts/lib/cut.js';

let canvas = null;
export const setExportCanvas = (cv) => (canvas = cv);

// ---- provenance
const today = () => new Date().toISOString().slice(0, 10);

/**
 * The subdivision layers the map uses (painted units and exact outlines): {ne: true if Natural Earth's admin-1,
 * other: [layer index entries]} — every one of them is credited.
 */
function usedLayers() {
  const keys = new Set();
  for (const k of app.units.keys()) {
    const [n, code] = splitKey(k);
    keys.add(n + '|' + layerOfCode(code));
  }
  for (const r of app.objects) if (r.t === 'shape' && r.ref && r.ref.k === 'a1') keys.add(r.ref.c + '|' + (r.ref.y || ''));
  const other = new Map();
  let ne = false;
  for (const k of keys) {
    const [n, y] = splitKey(k);
    if (!y) ne = true;
    else {
      const x = (geo.layers[n] || []).find((l) => l.id === y);
      if (x) other.set(x.id, x);
    }
  }
  return { ne, other: [...other.values()] };
}
/** One line printed on the map. */
export function sourceLine(label) {
  const more = [...new Set(usedLayers().other.map((x) => x.short))],
    st = statCredit(app.stat);
  return (
    'Data: Natural Earth (public domain)' +
    more.map((s) => ', ' + s).join('') +
    (st ? '; statistic: ' + st.short : '') +
    (app.fictional ? ' · Fictional scenario' : '') +
    ' · ' +
    cap(label) +
    ' · Ecumene ' +
    VERSION +
    ' · ' +
    today()
  );
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// printed in the SVG description of a map marked as a fictional scenario (the checkbox in the Legend panel)
const FICTIONAL_NOTE =
  'Fictional scenario: the regions, routes and events drawn on this map are invented and are not historical borders or events. The country borders and coastlines underneath are Natural Earth’s present-day ones.';
const LAKE_SETS = { none: 'the IJsselmeer', major: 'the IJsselmeer and the major lakes', all: 'every lake' };
/** Fuller description embedded in SVG metadata; cuts says which lakes were cut out of the shapes (see cutShapes). */
export function sourceDetails(label, cuts) {
  const L = [
    ...(app.fictional ? [FICTIONAL_NOTE] : []),
    'Made with Ecumene ' + VERSION + ' (https://ecumenemaps.github.io/ecumene/) on ' + today() + '.',
    'Projection: ' + label + '.',
    'Country borders: Natural Earth 1:10m Admin 0 countries, version 4.1.0, via world-atlas 2.0.2. Public domain. French Guiana, Guadeloupe, Martinique, Mayotte, Réunion and the Caribbean Netherlands are shown apart from France and the Netherlands.',
  ];
  // the always-water lakes (the IJsselmeer) are drawn whatever the Lakes setting
  if (app.layers.lakes !== 'none' || app.layers.rivers || (geo.phys && geo.phys.lakeSea.rings))
    L.push('Lakes and rivers: Natural Earth 1:10m physical vectors. Public domain.');
  const used = usedLayers();
  if (used.ne) L.push('Subdivisions: Natural Earth 1:10m Admin 1 states and provinces. Public domain.');
  for (const x of used.other) L.push(x.title + ': ' + x.ed + ', ' + x.url + '. ' + (x.note ? x.note + ' ' : '') + x.credit + ' Fitted to the Natural Earth coastline.');
  const st = statCredit(app.stat);
  if (st) L.push(st.detail);
  if (cuts) {
    L.push('Country and subdivision shapes have ' + LAKE_SETS[cuts.set] + ' cut out, so they stop at the shore.');
    if (cuts.failed.size) L.push('Not cut, so their shapes still cover the water: ' + [...cuts.failed].join(', ') + '.');
  } else if (cuts === null) L.push('Country and subdivision shapes include their lakes; the lakes are drawn over them.');
  L.push('Borders show Natural Earth\u2019s de facto conventions; disputed areas are not marked.');
  return L.join(' ');
}

function drawTopLayers(c, W, H, label) {
  drawTinyMarkers(c, false);
  drawObjects(c, false);
  if (app.layers.names) drawCountryNames(c);
  drawObjectLabels(c);
  const lg = drawLegend(c, W, H);
  if (app.legend.note) drawSourceNote(c, W, H, sourceLine(label), lg);
}

// ---- PNG
export async function exportPNG(scale, opts) {
  // anything other than the globe as shown is drawn as SVG and rasterised
  if (opts && !(opts.proj === 'ortho' && opts.area === 'screen')) return rasterise(await buildSVG(opts), scale);
  try {
    await document.fonts.ready;
  } catch (_) {}
  await loadPainted();
  const cv = canvas,
    od = app.dpr,
    hv = app.hover;
  app.hover = 0;
  app.dpr = od * scale;
  cv.width = Math.round(app.W * app.dpr);
  cv.height = Math.round(app.H * app.dpr);
  render(Rb() * app.dpr);
  const o = document.createElement('canvas');
  o.width = cv.width;
  o.height = cv.height;
  const c = o.getContext('2d');
  c.drawImage(cv, 0, 0);
  c.setTransform(app.dpr, 0, 0, app.dpr, 0, 0);
  drawTopLayers(c, app.W, app.H, exportView({ proj: 'ortho', area: 'screen' }).label);
  app.hover = hv;
  app.dpr = od;
  cv.width = Math.round(app.W * app.dpr);
  cv.height = Math.round(app.H * app.dpr);
  render(Rb() * app.dpr);
  redraw();
  return new Promise((r) => o.toBlob(r, 'image/png'));
}

// ---- SVG
const notSame = (a, b) => a === b || a.properties.name !== b.properties.name;
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * A few tiny island polygons in the 10m data wind the wrong way after quantisation, which d3 reads
 * as "everything except this island". Flip those once (the WebGL mesh is unaffected).
 */
let fixedFeats = null;
function countryFeats() {
  if (fixedFeats) return fixedFeats;
  const fixPoly = (rings) => {
    const f = { type: 'Polygon', coordinates: rings };
    return geoArea(f) > 2 * Math.PI ? rings.map((r) => r.slice().reverse()) : rings;
  };
  fixedFeats = geo.feats.map((f) => {
    const g = f.geometry,
      geometry =
        g.type === 'Polygon'
          ? { type: 'Polygon', coordinates: fixPoly(g.coordinates) }
          : { type: 'MultiPolygon', coordinates: g.coordinates.map(fixPoly) };
    return { type: 'Feature', properties: f.properties, geometry };
  });
  return fixedFeats;
}

/**
 * Lake rings come without hole information; orient each one as a small polygon and fill even-odd.
 * Mode 'sea' gives the always-water lakes; 'major' and 'all' give the other lakes the Lakes setting shows.
 */
function lakeRings(p, mode) {
  const from = mode === 'sea' ? 0 : p.lakeSea.rings,
    to = mode === 'sea' ? p.lakeSea.rings : mode === 'all' ? p.lakeLines.lens.length : p.lakeMajor.rings,
    out = [];
  let o = 0;
  for (let i = 0; i < from; i++) o += p.lakeLines.lens[i];
  for (let i = from; i < to; i++) {
    const len = p.lakeLines.lens[i],
      ring = [];
    for (let k = 0; k < len; k++) ring.push([p.lakeLines.pts[2 * (o + k)], p.lakeLines.pts[2 * (o + k) + 1]]);
    o += len;
    if (ring.length < 4) continue;
    const f = { type: 'Polygon', coordinates: [ring] };
    if (geoArea(f) > 2 * Math.PI) ring.reverse();
    out.push(f);
  }
  return out;
}
function riverLines(p, zoom) {
  const lines = [];
  p.rivers.tiers.forEach(([a, b], t) => {
    if (zoom < RIVER_MIN_ZOOM[t]) return;
    const L = [];
    let o = 0;
    for (let i = 0; i < a; i++) o += p.rivers.lens[i];
    for (let i = a; i < b; i++) {
      const len = p.rivers.lens[i],
        ln = [];
      for (let k = 0; k < len; k++) ln.push([p.rivers.pts[2 * (o + k)], p.rivers.pts[2 * (o + k) + 1]]);
      o += len;
      L.push(ln);
    }
    lines.push({ t, geom: { type: 'MultiLineString', coordinates: L } });
  });
  return lines;
}
function graticule() {
  const L = [];
  for (let lo = -180; lo < 180; lo += 10) {
    const ln = [],
      top = lo % 90 ? 80 : 90;
    for (let la = -top; la <= top; la += 2) ln.push([lo, la]);
    L.push(ln);
  }
  for (let la = -80; la <= 80; la += 10) {
    const ln = [];
    for (let lo = -180; lo <= 180; lo += 2) ln.push([lo, la]);
    L.push(ln);
  }
  return { type: 'MultiLineString', coordinates: L };
}

// ---- lakes cut out of the country and subdivision shapes
// The clipper is a separate file (dist/app/clip.js) loaded on the first export, so the editor's first load stays small.
let clipLoad = null;
function loadClip() {
  if (!clipLoad)
    clipLoad = new Promise((ok, no) => {
      if (window.polygonClipping) return ok(window.polygonClipping);
      const s = document.createElement('script');
      s.src = 'clip.js';
      s.onload = () => (window.polygonClipping ? ok(window.polygonClipping) : no(new Error('clip.js loaded without the clipper')));
      s.onerror = () => no(new Error('could not load clip.js'));
      document.head.appendChild(s);
    }).catch((e) => {
      console.warn('Lakes are not cut out of exported shapes:', e.message);
      clipLoad = null;
      return null;
    });
  return clipLoad;
}
// per Lakes setting: the prepared lakes and the shapes already cut (by country feature, and by unit key)
const cutCache = new Map();
/**
 * Cut the lakes the map shows (the always-water ones, plus the major or all lakes as the Lakes setting says) out of
 * every country and every painted subdivision. Returns {set, countries: [geometry by feature], units: Map key ->
 * geometry, failed: Set of names left uncut}, or null when the clipper or the lake polygons are not available.
 * The same cut runs over all the data in tests/unit/cut.test.mjs, so failures are not expected here.
 */
async function cutShapes() {
  const p = geo.phys;
  if (!p || !p.lakePolys) return null;
  const pc = await loadClip();
  if (!pc) return null;
  const set = app.layers.lakes,
    to = set === 'all' ? p.lakeLines.lens.length : set === 'major' ? p.lakeMajor.rings : p.lakeSea.rings;
  if (!cutCache.has(set)) cutCache.set(set, { lakes: prepareLakes(lakePolygons(p, to)), countries: new Map(), units: new Map() });
  const C = cutCache.get(set),
    failed = new Set();
  const countries = countryFeats().map((f, i) => {
    if (!C.countries.has(i)) C.countries.set(i, cutLakes(f.geometry, C.lakes, pc));
    const r = C.countries.get(i);
    if (r.failed) failed.add(f.properties.name);
    return r.geometry;
  });
  const units = new Map();
  app.units.forEach((col, k) => {
    const n = splitKey(k)[0],
      f = unitByKey(k);
    if (!f) return;
    if (!C.units.has(k)) C.units.set(k, cutLakes(f.geometry, C.lakes, pc));
    const r = C.units.get(k);
    if (r.failed) failed.add(f.properties.n + ' (' + n + ')');
    units.set(k, r.geometry);
  });
  return { set, countries, units, failed };
}

/** Build the SVG document for the current view. Returns a string. */
export async function buildSVG(opts = { proj: 'ortho', area: 'screen' }) {
  try {
    await document.fonts.ready;
  } catch (_) {}
  await loadPainted();
  const cuts = await cutShapes();
  const v = exportView(opts);
  // everything below is synchronous, so the swapped-in projection never leaks into screen drawing
  return withProjection(v.p, v.kind !== 'globe', () => drawSVG(v, cuts));
}

function drawSVG(v, cuts) {
  const { W, H, p: pj, label } = v,
    S = app.style,
    Ly = app.layers;
  const c = new SvgContext(document.createElement('canvas').getContext('2d'));
  const path = geoPath(pj, c);
  const sphere = () => {
    c.beginPath();
    path({ type: 'Sphere' });
  };
  // background and ocean
  c.group('background');
  c.fillStyle = S.bg;
  c.fillRect(0, 0, W, H);
  c.end();
  c.group('ocean');
  c.fillStyle = S.water;
  sphere();
  c.fill();
  c.end();
  // countries, one element per name so they are easy to select in an editor; with the lakes cut out when available
  const byName = new Map();
  countryFeats().forEach((f, i) => {
    const n = f.properties.name;
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(cuts ? cuts.countries[i] : f);
  });
  c.group('countries');
  for (const [n, fs] of byName) {
    const col = app.fills.get(n);
    c.beginPath();
    for (const f of fs) path(f);
    fillWith(c, col || S.land);
    c.tag({ id: 'country-' + slug(n), 'data-name': n });
    c.fill();
  }
  c.end();
  // painted subdivisions, one element per unit, stroked in its own colour so neighbours meet without seams;
  // the borders group below covers the country's coast and borders
  if (app.units.size) {
    c.group('subdivisions');
    c.lineWidth = 0.8;
    c.lineJoin = 'round';
    app.units.forEach((col, k) => {
      const [n, code] = splitKey(k),
        f = unitByKey(k);
      if (!f) return;
      c.beginPath();
      path((cuts && cuts.units.get(k)) || f);
      // a pattern's seam-hiding stroke is its background color
      fillWith(c, col);
      c.strokeStyle = baseColor(col);
      c.tag({ id: 'unit-' + slug(code), 'data-name': f.properties.n, 'data-country': n });
      c.fillStroke();
    });
    c.lineJoin = 'miter';
    c.end();
  }
  const p = geo.phys;
  // always-water lakes (the IJsselmeer), filled at every Lakes setting; their shore is drawn with the borders
  if (p && p.lakeSea.rings) {
    c.group('inland-sea');
    c.beginPath();
    for (const f of lakeRings(p, 'sea')) path(f);
    c.fillStyle = S.water;
    c.fill('evenodd');
    c.end();
  }
  if (p && Ly.lakes !== 'none') {
    c.group('lakes');
    c.beginPath();
    for (const f of lakeRings(p, Ly.lakes)) path(f);
    c.fillStyle = S.water;
    c.fill('evenodd');
    c.end();
  }
  if (Ly.grat) {
    c.group('graticule');
    c.beginPath();
    path(graticule());
    c.strokeStyle = S.grat;
    c.globalAlpha = 0.3;
    c.lineWidth = 1;
    c.stroke();
    c.globalAlpha = 1;
    c.end();
  }
  if (p && Ly.lakes !== 'none') {
    c.group('lake-shores');
    c.beginPath();
    for (const f of lakeRings(p, Ly.lakes)) path(f);
    c.strokeStyle = S.river;
    c.globalAlpha = 0.9;
    c.lineWidth = 0.9;
    c.stroke();
    c.globalAlpha = 1;
    c.end();
  }
  if (p && Ly.rivers) {
    c.group('rivers');
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const zoom = v.p.scale() / ((Math.min(app.W, app.H) / 2) * 0.94);
    for (const { t, geom } of riverLines(p, zoom)) {
      c.beginPath();
      path(geom);
      c.strokeStyle = S.river;
      c.globalAlpha = 0.95;
      c.lineWidth = RIVER_WIDTH[t];
      c.stroke();
    }
    c.globalAlpha = 1;
    c.lineCap = 'butt';
    c.lineJoin = 'miter';
    c.end();
  }
  if (Ly.borders) {
    c.group('borders');
    c.beginPath();
    path(mesh(geo.topo, geo.topo.objects.countries, notSame));
    if (p) for (const f of lakeRings(p, 'sea')) path(f);
    c.strokeStyle = S.border;
    c.globalAlpha = 0.95;
    c.lineWidth = S.bw;
    c.lineJoin = 'round';
    c.stroke();
    c.globalAlpha = 1;
    c.lineJoin = 'miter';
    c.end();
  }
  // shading: the same highlight and limb darkening as the globe, as radial gradients
  let defs = '';
  if (S.shade > 0 && v.globe) {
    const { cx, cy, R } = v.globe;
    const hx = cx - 0.35 * R,
      hy = cy - 0.4 * R;
    defs =
      '<defs>' +
      '<radialGradient id="hl" gradientUnits="userSpaceOnUse" cx="' + hx.toFixed(1) + '" cy="' + hy.toFixed(1) + '" r="' + (R / 1.1).toFixed(1) + '">' +
      '<stop offset="0" stop-color="#fff" stop-opacity="' + (0.18 * S.shade).toFixed(3) + '"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="limb" gradientUnits="userSpaceOnUse" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + R.toFixed(1) + '">' +
      '<stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="0.8" stop-color="#000" stop-opacity="' + (0.14 * S.shade).toFixed(3) + '"/>' +
      '<stop offset="1" stop-color="#000" stop-opacity="' + (0.28 * S.shade).toFixed(3) + '"/></radialGradient>' +
      '</defs>\n';
    c.group('shading', ' pointer-events="none"');
    const circ = (fill) =>
      c.raw('<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + R.toFixed(1) + '" fill="url(#' + fill + ')"/>');
    circ('hl');
    circ('limb');
    c.end();
  }
  c.group('rim');
  sphere();
  c.strokeStyle = S.rim;
  c.lineWidth = 1.5;
  c.stroke();
  c.end();
  // countries too small to see, one circle each, named like the country paths
  const marks = tinyMarkers();
  if (marks.length) {
    c.group('small-countries');
    for (const m of marks) {
      const k = markerPaint(m),
        at = { id: 'marker-' + slug(m.n), 'data-name': m.n, cx: m.p[0].toFixed(1), cy: m.p[1].toFixed(1), r: MARK_R, fill: k.fill, stroke: k.edge, 'stroke-width': 1 };
      c.raw('<circle' + Object.entries(at).map(([a, v]) => ' ' + a + '="' + esc(v) + '"').join('') + '/>');
    }
    c.end();
  }
  c.group('regions-and-notes');
  drawObjects(c, false);
  c.end();
  if (Ly.names) {
    c.group('country-names');
    drawCountryNames(c);
    c.end();
  }
  c.group('labels');
  drawObjectLabels(c);
  c.end();
  c.group('legend');
  const lg = drawLegend(c, W, H);
  c.end();
  if (app.legend.note) {
    c.group('source-note');
    drawSourceNote(c, W, H, sourceLine(label), lg);
    c.end();
  }
  const title = app.legend.title.trim() || 'Map made with Ecumene';
  const head = '<title>' + esc(title) + '</title>\n<desc>' + esc(sourceDetails(label, cuts)) + '</desc>\n' + defs;
  return c.toString(W, H, head);
}
export async function exportSVG(opts) {
  return new Blob([await buildSVG(opts)], { type: 'image/svg+xml' });
}

/** Draw an SVG string onto a canvas at the given scale and return a PNG blob. */
async function rasterise(svg, scale) {
  const m = /width="(\d+)" height="(\d+)"/.exec(svg),
    W = +m[1],
    H = +m[2];
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const o = document.createElement('canvas');
    o.width = Math.round(W * scale);
    o.height = Math.round(H * scale);
    const c = o.getContext('2d');
    c.drawImage(img, 0, 0, o.width, o.height);
    return await new Promise((r) => o.toBlob(r, 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
