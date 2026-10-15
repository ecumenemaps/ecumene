// Paintable subdivisions. A country's units load when the pointer rests on it; painted units live in app.units as
// 'Country|code' -> colour. A country can offer several layers: Natural Earth's states and provinces (layer '', code
// its adm1_code) and the layers in layers/index.json (built from scripts/sources), whose codes carry the layer id:
// 'gb-wpc-2024:E14001063'. A country is painted with one layer at a time (app.sub.layer, else the layer of its paint).
// Loaded units are triangulated into a second fill mesh that the globe draws over the countries (gl.js), skipping
// unpainted units so the country's own fill shows through, and drawing the borders on top.
import { geoBounds, geoContains } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import earcut from 'earcut';
import { triangulate } from '../../scripts/lib/tri.js';
import { app, emit, on, redraw } from './store.js';
import { unitsAt, onDate } from './dated.js';
import { geo, inSea } from './data.js';
import { loadSubdivisions } from './objects.js';
import { commit } from './history.js';
import { uploadUnitMesh, setUnitPainter, setUnitAnchor, setUnitLines, segs, putPaint, UPAL_ROWS } from './gl.js';

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
// Subdivision borders (app.sublines) are drawn for the layers that have paint, and in Subdivisions mode for the
// country under the pointer; the lines of those layers are joined and handed to the globe when the set changes.
let linesShown = '';
// the loaded layers whose borders show: those with paint, and (not in exports, which clear the hover) the one
// being pointed at in Subdivisions mode
function shownLayers() {
  const keys = new Set();
  for (const k of app.units.keys()) {
    const [n, code] = splitKey(k);
    keys.add(n + '|' + layerOfCode(code));
  }
  if (app.sub.on && app.subHov && app.hover) keys.add(app.subHov.country + '|' + activeLayer(app.subHov.country));
  return [...keys].filter((k) => ready.has(k)).sort();
}
function linesOf(k) {
  const U = ready.get(k);
  if (!U.lines) {
    // a dated layer's borders are those of the units on the day shown
    const t = U.dated ? { ...U.topo, objects: { u: { type: 'GeometryCollection', geometries: U.topo.objects.u.geometries.filter((g) => onDate(g.properties, U.day)) } } } : U.topo;
    U.lines = unitLines(t, U.gr);
  }
  return U.lines;
}
function updateLines() {
  if (!app.sublines.on) return;
  const shown = shownLayers(),
    sig = shown.join('\n') + '\n' + app.sub.date;
  if (sig === linesShown) return;
  linesShown = sig;
  const join = (part) => {
    const arrs = shown.map((k) => linesOf(k)[part]),
      out = new Float32Array(arrs.reduce((s, a) => s + a.length, 0));
    let o = 0;
    for (const a of arrs) {
      out.set(a, o);
      o += a.length;
    }
    return out;
  };
  setUnitLines(join('u'), join('g'));
}
/**
 * The borders of a country's units from its TopoJSON: between units (u), and between the larger parts the layer
 * groups them into (g, where it has that grouping), as globe segments and as GeoJSON for SVG export (mu, mg).
 */
export function unitLines(t, gr) {
  const o = t.objects.u,
    mu = mesh(t, o, (a, b) => a !== b),
    mg = gr && gr.g ? mesh(t, o, (a, b) => a !== b && a.properties.g !== b.properties.g) : { type: 'MultiLineString', coordinates: [] };
  return { u: segs(mu.coordinates), g: segs(mg.coordinates), mu, mg };
}
/** The subdivision borders shown, as GeoJSON for export: [{u, g}] per layer. Empty when they are switched off. */
export const shownUnitLines = () => (app.sublines.on ? shownLayers().map((k) => ({ u: linesOf(k).mu, g: linesOf(k).mg })) : []);

/** Fill the subdivision palette and pattern bytes from app.units before a frame; returns false when nothing is painted. */
function paintPalette(pal, pat) {
  updateLines();
  pal.fill(0);
  pat.fill(0);
  let any = false;
  app.units.forEach((col, k) => {
    const f = unitByKey(k);
    if (!f) return;
    putPaint(pal, pat, f.gid, col);
    any = true;
  });
  return any;
}
setUnitPainter(paintPalette);

/** Load a country's units in a layer, by default the one it is painted with (cached). Resolves to {feats, byCode, mesh}. */
export function loadUnits(country, layer = activeLayer(country)) {
  const key = country + '|' + layer;
  if (ready.has(key)) {
    // a dated layer is ready once it shows the day set now (exports and opening a map wait for this)
    const U = ready.get(key);
    return U.dated ? showDay(U).then(() => U) : Promise.resolve(U);
  }
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
            setUnitAnchor(f.gid, geo.nameId.get(country) || 0);
            // a layer's codes carry its id, so a painted key says which layer it belongs to
            if (layer) f.properties.c = layer + ':' + f.properties.c;
          });
          const info = layerInfo(country, layer) || {};
          let U;
          if (info.dated) {
            // every version is loaded; those in force on the day shown are triangulated as they are first needed
            U = { country, layer, dated: info.dated, all: feats, parts: new Map(), queue: Promise.resolve(), day: 0, feats: [], byCode: new Map(), mesh: null, topo: t, gr: info.gr, lines: null };
            // until it is ready the 'date' event does not see it, so keep up with a day changed meanwhile (undo)
            do await showDay(U);
            while (U.day !== app.sub.date);
          } else {
            // the same 4-degree grid as the country mesh, so long edges follow the sphere
            const mesh = await triangulate(feats, earcut, 4, tick, feats.map((f) => f.gid));
            U = {
              feats,
              byCode: new Map(feats.map((f) => [f.properties.c, f])),
              mesh: { ll: mesh.ll, id: mesh.id, idx: mesh.idx },
              // borders are worked out the first time they are shown
              topo: t,
              gr: info.gr,
              lines: null,
            };
          }
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
// ---- dated layers (#46): the units in force on app.sub.date
/**
 * Show a dated layer on app.sub.date: triangulate the units not seen before (kept, so moving back and forth costs only
 * putting the mesh together), then its units, codes and mesh become that day's. Calls run one after another, each
 * for the day set when it runs.
 */
function showDay(U) {
  U.queue = U.queue.then(async () => {
    const day = app.sub.date;
    if (U.day === day) return;
    const on = unitsAt(U.all, day),
      todo = on.filter((f) => !U.parts.has(f.gid));
    if (todo.length) {
      const m = await triangulate(todo, earcut, 4, tick, todo.map((f) => f.gid));
      splitMesh(m, U.parts);
      for (const f of todo) if (!U.parts.has(f.gid)) U.parts.set(f.gid, { ll: new Float32Array(0), id: new Uint16Array(0), idx: new Uint32Array(0) });
    }
    // a later day was set while triangulating: its own call follows
    if (app.sub.date !== day) return;
    // only this day's units, so the mesh stays the size of one country however many days have been seen
    const P = on.map((f) => U.parts.get(f.gid)),
      nv = P.reduce((s, p) => s + p.id.length, 0),
      ll = new Float32Array(2 * nv),
      id = new Uint16Array(nv),
      idx = new Uint32Array(P.reduce((s, p) => s + p.idx.length, 0));
    let v = 0,
      i = 0;
    for (const p of P) {
      ll.set(p.ll, 2 * v);
      id.set(p.id, v);
      for (let k = 0; k < p.idx.length; k++) idx[i + k] = p.idx[k] + v;
      v += p.id.length;
      i += p.idx.length;
    }
    Object.assign(U, { day, feats: on, byCode: new Map(on.map((f) => [f.properties.c, f])), mesh: { ll, id, idx }, lines: null });
  });
  return U.queue;
}
/** Split a triangulated mesh into one mesh per unit (by the palette id on each vertex), added to parts. */
function splitMesh(m, parts) {
  const at = new Int32Array(m.id.length).fill(-1),
    acc = new Map();
  for (let k = 0; k < m.idx.length; k++) {
    const v = m.idx[k],
      g = m.id[v];
    if (!acc.has(g)) acc.set(g, { ll: [], idx: [] });
    const a = acc.get(g);
    if (at[v] < 0) {
      at[v] = a.ll.length / 2;
      a.ll.push(m.ll[2 * v], m.ll[2 * v + 1]);
    }
    a.idx.push(at[v]);
  }
  for (const [g, a] of acc) parts.set(g, { ll: Float32Array.from(a.ll), id: new Uint16Array(a.ll.length / 2).fill(g), idx: Uint32Array.from(a.idx) });
}
/**
 * Is a painted unit ('Country|code') on the map? Not when its layer is dated and the unit is not in force on the day
 * shown (Missouri Territory in 1861), so the legend does not list a color nothing on the map has.
 */
export function unitShown(k) {
  const [n, code] = splitKey(k),
    U = ready.get(n + '|' + layerOfCode(code));
  return !U || !U.dated || U.byCode.has(code);
}
/** Show dated layers on day n (yyyymmdd); true if the day changed. Undo and opening a map set app.sub.date and emit 'date' themselves. */
export function setDate(n) {
  if (app.sub.date === n) return false;
  app.sub.date = n;
  emit('date');
  return true;
}
on('date', () => {
  const U = [...ready.values()].filter((x) => x.dated);
  if (!U.length) return;
  app.subHov = null;
  Promise.all(U.map(showDay)).then(() => {
    linesShown = '';
    uploadMeshes();
    emit('legend');
    redraw();
  });
});
/** The dated layer of a country, if it offers one: its index entry. */
export const datedLayer = (country) => layersOf(country).find((x) => x.dated) || null;
/**
 * The country whose dated layer has a unit at a lon/lat beyond its own border (Oregon Country over today's Canada), when
 * that layer is the one it is painted with and is loaded; else the country under the pointer.
 */
export function claimOf(country, g) {
  if (!g) return country;
  for (const U of ready.values())
    if (U.dated && U.country !== country && activeLayer(U.country) === U.layer && U.feats.some((f) => inBounds(f, g) && geoContains(f, g))) return U.country;
  return country;
}
/** The day dated layers show, for credits: their index entries and the day, or null when none is used. */
export function datedInUse() {
  const L = [];
  for (const c of new Set([...paintedCountries(), ...Object.keys(app.sub.layer)])) {
    const x = layerInfo(c, activeLayer(c));
    if (x && x.dated) L.push(x);
  }
  return L.length ? { layers: L, day: app.sub.date } : null;
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
/** The paint a dated layer's "outside" unit (land not yet part of the country) gets when the layer is chosen. */
export const OUTSIDE_PAINT = 'p:diag:#f2f0eb:#b8b2a7';
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
  other.forEach((k) => app.units.delete(k));
  // a dated layer marks the land not yet part of the country, so it never reads as the country's own
  const info = layerInfo(country, layer),
    out = info && info.dated ? unitKey(country, layer + ':outside') : '';
  const mark = out && !app.units.has(out);
  if (mark) {
    app.units.set(out, OUTSIDE_PAINT);
    if (!app.labels[OUTSIDE_PAINT]) app.labels[OUTSIDE_PAINT] = info.dated.outside || 'Outside the country';
  }
  if (other.length || mark) {
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
