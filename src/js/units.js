// Paintable subdivisions. A country's units load when the pointer rests on it; painted units live in app.units as
// 'Country|code' -> colour. A country can offer several layers: Natural Earth's states and provinces (layer '', code
// its adm1_code) and the layers in layers/index.json (built from scripts/sources), whose codes carry the layer id:
// 'gb-wpc-2024:E14001063'. A country is painted with one layer at a time (app.sub.layer, else the layer of its paint).
// Loaded units are triangulated into a second fill mesh that the globe draws over the countries (gl.js), skipping
// unpainted units so the country's own fill shows through, and drawing the borders on top.
import { geoBounds, geoContains } from 'd3-geo';
import { feature } from 'topojson-client';
import earcut from 'earcut';
import { triangulate } from '../../scripts/lib/tri.js';
import { app, emit, redraw } from './store.js';
import { geo, inSea } from './data.js';
import { loadSubdivisions } from './objects.js';
import { commit } from './history.js';
import { uploadUnitMesh, setUnitPainter, UPAL_ROWS } from './gl.js';
import { hx } from './util.js';

/** How long the pointer rests on a country before its units load. */
export const LOAD_DELAY = 75;
/** Detail levels: finest units, or every unit of the same region ('r') or constituent part ('g'). */
export const DETAIL = { u: 'Finest units', r: 'Regions', g: 'Constituent parts' };

export const unitKey = (country, code) => country + '|' + code;
export function splitKey(k) {
  const i = k.indexOf('|');
  return [k.slice(0, i), k.slice(i + 1)];
}
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
/** The layer a unit code belongs to: '' for Natural Earth's adm1_code, else the id before the colon. */
export const layerOfCode = (code) => {
  const i = code.indexOf(':');
  return i < 0 ? '' : code.slice(0, i);
};
/** The layers a country offers: [{id, name, unit, f, gr, ...}], Natural Earth's first when it has one. */
export function layersOf(country) {
  const L = [];
  if (own(geo.a1index, country)) {
    const a = geo.a1index[country];
    L.push({ id: '', name: 'States and provinces (Natural Earth)', unit: 'Subdivision', f: 'admin1/' + a.f, gr: a.gr || {}, n: a.n });
  }
  for (const x of geo.layers[country] || []) L.push({ ...x, f: 'layers/' + x.f, gr: x.gr || {} });
  return L;
}
export const layerInfo = (country, layer) => layersOf(country).find((x) => x.id === layer) || null;
/** Can this country's subdivisions be painted? */
export const hasUnits = (country) => own(geo.a1index, country) || own(geo.layers, country);
/**
 * The layer a country is painted with: the layer of its paint (so undo, which restores paint, restores the layer
 * too), else the one chosen for it, else its first.
 */
export function activeLayer(country) {
  for (const k of app.units.keys()) {
    const [n, code] = splitKey(k);
    if (n === country) return layerOfCode(code);
  }
  const L = layersOf(country),
    chosen = app.sub.layer[country];
  if (chosen !== undefined && L.some((x) => x.id === chosen)) return chosen;
  return L.length ? L[0].id : '';
}
/** Layers that have paint in a country. */
export function paintedLayers(country) {
  const s = new Set();
  for (const k of app.units.keys()) {
    const [n, code] = splitKey(k);
    if (n === country) s.add(layerOfCode(code));
  }
  return s;
}

const ready = new Map(), // 'country|layer' -> {feats, byCode, mesh}
  loading = new Map(); // 'country|layer' -> promise
let nextGid = 0; // palette id of the next loaded unit (each unit has f.gid)
const MAX_GID = 1024 * UPAL_ROWS - 1;
/** A country's loaded units in a layer (by default the one it is painted with), or null. */
export const unitsOf = (country, layer = activeLayer(country)) => ready.get(country + '|' + layer) || null;
/** The loaded unit a painted key ('Country|code') refers to, or null. */
export function unitByKey(k) {
  const [n, code] = splitKey(k),
    U = ready.get(n + '|' + layerOfCode(code));
  return (U && U.byCode.get(code)) || null;
}

// yield to the browser now and then while triangulating a large country
const tick = () => new Promise((r) => setTimeout(r, 0));
/** Concatenate every loaded country's triangles and hand them to the globe. */
function uploadMeshes() {
  let nv = 0,
    ni = 0;
  for (const U of ready.values()) {
    nv += U.mesh.id.length;
    ni += U.mesh.idx.length;
  }
  const ll = new Float32Array(2 * nv),
    ids = new Uint16Array(nv),
    idx = new Uint32Array(ni);
  let v = 0,
    i = 0;
  for (const U of ready.values()) {
    const m = U.mesh;
    ll.set(m.ll, 2 * v);
    ids.set(m.id, v);
    for (let k = 0; k < m.idx.length; k++) idx[i + k] = m.idx[k] + v;
    v += m.id.length;
    i += m.idx.length;
  }
  uploadUnitMesh(ll, idx, ids);
}
/** Fill the subdivision palette from app.units before a frame; returns false when nothing is painted. */
function paintPalette(pal) {
  pal.fill(0);
  let any = false;
  app.units.forEach((col, k) => {
    const f = unitByKey(k);
    if (!f) return;
    pal.set(hx(col), f.gid * 4);
    pal[f.gid * 4 + 3] = 255;
    any = true;
  });
  return any;
}
setUnitPainter(paintPalette);

/** Load a country's units in a layer, by default the one it is painted with (cached). Resolves to {feats, byCode, mesh}. */
export function loadUnits(country, layer = activeLayer(country)) {
  const key = country + '|' + layer;
  if (ready.has(key)) return Promise.resolve(ready.get(key));
  if (!loading.has(key))
    loading.set(
      key,
      loadSubdivisions(country, layer).then(
        async (t) => {
          const feats = feature(t, t.objects.u).features;
          if (nextGid + feats.length > MAX_GID) throw new Error('too many subdivisions loaded');
          feats.forEach((f) => {
            f.bb = geoBounds(f);
            f.gid = ++nextGid;
            // a layer's codes carry its id, so a painted key says which layer it belongs to
            if (layer) f.properties.c = layer + ':' + f.properties.c;
          });
          // the same 4-degree grid as the country mesh, so long edges follow the sphere
          const mesh = await triangulate(feats, earcut, 4, tick, feats.map((f) => f.gid));
          const U = { feats, byCode: new Map(feats.map((f) => [f.properties.c, f])), mesh: { ll: mesh.ll, id: mesh.id, idx: mesh.idx } };
          ready.set(key, U);
          loading.delete(key);
          uploadMeshes();
          redraw();
          return U;
        },
        (e) => {
          loading.delete(key);
          throw e;
        },
      ),
    );
  return loading.get(key);
}
/** Load every country and layer that has painted units (before an export, after opening a map). */
export const loadPainted = () =>
  Promise.all([...paintedCountries()].flatMap((c) => [...paintedLayers(c)].map((y) => loadUnits(c, y).catch(() => null))));

function inBounds(f, g) {
  const b = f.bb;
  if (g[1] < b[0][1] - 0.01 || g[1] > b[1][1] + 0.01) return false;
  const x0 = b[0][0],
    x1 = b[1][0];
  return x0 <= x1 ? g[0] >= x0 - 0.01 && g[0] <= x1 + 0.01 : g[0] >= x0 - 0.01 || g[0] <= x1 + 0.01;
}
/** The loaded unit of a country at a lon/lat, or null. */
export function unitAtLL(country, g) {
  const U = unitsOf(country);
  return U && g && !inSea(g[0], g[1]) ? U.feats.find((f) => inBounds(f, g) && geoContains(f, g)) || null : null;
}
/** The units a click on f paints at the current detail: its region or part where the layer has them, else f alone. */
export function targetsOf(country, f) {
  const k = app.sub.detail,
    v = f.properties[k],
    y = layerOfCode(f.properties.c),
    info = layerInfo(country, y);
  if (k === 'u' || !v || !info || !info.gr[k]) return [f];
  return unitsOf(country, y).feats.filter((x) => x.properties[k] === v);
}
/** Name for the hover tag: the unit and its region, or the region or part a click would paint. */
export function targetLabel(country, f) {
  const t = targetsOf(country, f);
  if (t.length > 1) return f.properties[app.sub.detail];
  const p = f.properties;
  return p.r && p.r !== p.n ? p.n + ' · ' + p.r : p.n;
}

/** Countries with at least one painted unit. */
export function paintedCountries() {
  const s = new Set();
  for (const k of app.units.keys()) s.add(splitKey(k)[0]);
  return s;
}
/** Set (hex) or clear (null) one unit; no redraw or undo step. */
export function setUnit(country, code, col) {
  const k = unitKey(country, code);
  if (col) app.units.set(k, col);
  else app.units.delete(k);
}
/** Clear every painted unit of a country. Returns true if there were any. */
export function clearUnits(country) {
  let had = false;
  for (const k of [...app.units.keys()])
    if (splitKey(k)[0] === country) {
      app.units.delete(k);
      had = true;
    }
  return had;
}
/**
 * Click behaviour on units, like countries: paint them with the active colour, or clear them if they all have it.
 * With set, always paint (used while dragging). Returns true if anything changed.
 */
export function paintUnits(country, feats, set) {
  const codes = feats.map((f) => f.properties.c),
    off = !set && codes.every((c) => app.units.get(unitKey(country, c)) === app.active);
  let changed = false;
  for (const c of codes) {
    const want = off ? null : app.active;
    if ((app.units.get(unitKey(country, c)) || null) !== want) {
      setUnit(country, c, want);
      changed = true;
    }
  }
  return changed;
}
/**
 * Paint a country with another layer. Its paint in other layers is cleared as one undo step (after asking, when
 * confirmFn is given and there is some). Returns false if the person said no.
 */
export function setLayer(country, layer, confirmFn) {
  if (activeLayer(country) === layer) {
    app.sub.layer[country] = layer;
    return true;
  }
  const other = [...app.units.keys()].filter((k) => {
    const [n, code] = splitKey(k);
    return n === country && layerOfCode(code) !== layer;
  });
  if (other.length && confirmFn) {
    const from = layerInfo(country, layerOfCode(splitKey(other[0])[1])),
      to = layerInfo(country, layer);
    const msg =
      'Switch ' + country + ' to ' + to.name + '? This clears ' + other.length + ' painted ' + (from ? from.unit.toLowerCase() : 'subdivision') + (other.length === 1 ? '' : 's') + ' (Undo brings them back).';
    if (!confirmFn(msg)) return false;
  }
  app.sub.layer[country] = layer;
  if (other.length) {
    other.forEach((k) => app.units.delete(k));
    emit('legend');
    commit();
  }
  redraw();
  return true;
}
/** Paint the units at a lon/lat in a country as one undo step, loading them first if needed. */
export async function clickUnits(country, g) {
  await loadUnits(country);
  const f = unitAtLL(country, g);
  if (!f || !paintUnits(country, targetsOf(country, f))) return;
  emit('legend');
  redraw();
  commit();
}
