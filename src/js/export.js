// Exports: PNG (re-render the globe at the requested scale and composite the 2D layers on top) and
// SVG (the same map as vector layers), both with an optional source note.
import { geoPath, geoArea } from 'd3-geo';
import { mesh } from 'topojson-client';
import { app, redraw, VERSION } from './store.js';
import { render, RIVER_MIN_ZOOM, RIVER_WIDTH } from './gl.js';
import { geo } from './data.js';
import { Rb, withProjection } from './view.js';
import { exportView } from './projections.js';
import { drawObjects, drawObjectLabels, drawCountryNames, drawLegend, drawSourceNote } from './overlay.js';
import { SvgContext, esc } from './svgctx.js';

let canvas = null;
export const setExportCanvas = (cv) => (canvas = cv);

// ---- provenance
const today = () => new Date().toISOString().slice(0, 10);

/** One line printed on the map. */
export function sourceLine(label) {
  return 'Data: Natural Earth (public domain) · ' + cap(label) + ' · Ecumene ' + VERSION + ' · ' + today();
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** Fuller description embedded in SVG metadata. */
export function sourceDetails(label) {
  const L = [
    'Made with Ecumene ' + VERSION + ' (https://ecumenemaps.github.io/ecumene/) on ' + today() + '.',
    'Projection: ' + label + '.',
    'Country borders: Natural Earth 1:10m Admin 0 countries, version 4.1.0, via world-atlas 2.0.2. Public domain.',
  ];
  if (app.layers.lakes !== 'none' || app.layers.rivers) L.push('Lakes and rivers: Natural Earth 1:10m physical vectors. Public domain.');
  if (app.objects.some((r) => r.t === 'shape' && r.ref && r.ref.k === 'a1'))
    L.push('Subdivisions: Natural Earth 1:10m Admin 1 states and provinces. Public domain.');
  L.push('Borders show Natural Earth\u2019s de facto conventions; disputed areas are not marked.');
  return L.join(' ');
}

function drawTopLayers(c, W, H, label) {
  drawObjects(c, false);
  if (app.layers.names) drawCountryNames(c);
  drawObjectLabels(c);
  drawLegend(c, W, H);
  if (app.legend.note) drawSourceNote(c, W, H, sourceLine(label));
}

// ---- PNG
export async function exportPNG(scale, opts) {
  // anything other than the globe as shown is drawn as SVG and rasterised
  if (opts && !(opts.proj === 'ortho' && opts.area === 'screen')) return rasterise(await buildSVG(opts), scale);
  try {
    await document.fonts.ready;
  } catch (_) {}
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

/** Lake rings come without hole information; orient each one as a small polygon and fill even-odd. */
function lakeRings(p, mode) {
  const n = mode === 'all' ? p.lakeLines.lens.length : p.lakeMajor.rings,
    out = [];
  let o = 0;
  for (let i = 0; i < n; i++) {
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

/** Build the SVG document for the current view. Returns a string. */
export async function buildSVG(opts = { proj: 'ortho', area: 'screen' }) {
  try {
    await document.fonts.ready;
  } catch (_) {}
  const v = exportView(opts);
  // everything below is synchronous, so the swapped-in projection never leaks into screen drawing
  return withProjection(v.p, v.kind !== 'globe', () => drawSVG(v));
}

function drawSVG(v) {
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
  // countries, one element per name so they are easy to select in an editor
  const byName = new Map();
  for (const f of countryFeats()) {
    const n = f.properties.name;
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(f);
  }
  c.group('countries');
  for (const [n, fs] of byName) {
    const col = app.fills.get(n);
    c.beginPath();
    for (const f of fs) path(f);
    c.fillStyle = col || S.land;
    c.tag({ id: 'country-' + slug(n), 'data-name': n });
    c.fill();
  }
  c.end();
  const p = geo.phys;
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
  drawLegend(c, W, H);
  c.end();
  if (app.legend.note) {
    c.group('source-note');
    drawSourceNote(c, W, H, sourceLine(label));
    c.end();
  }
  const title = app.legend.title.trim() || 'Map made with Ecumene';
  const head = '<title>' + esc(title) + '</title>\n<desc>' + esc(sourceDetails(label)) + '</desc>\n' + defs;
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
