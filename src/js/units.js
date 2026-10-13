// Paintable subdivisions (admin-1 units: states, provinces, counties). A country's units load when the pointer
// rests on it; painted units live in app.units as 'Country|code' -> colour, code being Natural Earth's adm1_code.
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
/** Can this country's subdivisions be painted? */
export const hasUnits = (country) => Object.prototype.hasOwnProperty.call(geo.a1index, country);

const ready = new Map(), // country -> {feats, byCode, mesh}
  loading = new Map(); // country -> promise
let nextGid = 0; // palette id of the next loaded unit (each unit has f.gid)
const MAX_GID = 1024 * UPAL_ROWS - 1;
/** A loaded country's units, or null. */
export const unitsOf = (country) => ready.get(country) || null;

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
    const [n, code] = splitKey(k),
      U = ready.get(n),
      f = U && U.byCode.get(code);
    if (!f) return;
    pal.set(hx(col), f.gid * 4);
    pal[f.gid * 4 + 3] = 255;
    any = true;
  });
  return any;
}
setUnitPainter(paintPalette);

/** Load a country's units (cached). Resolves to {feats, byCode, mesh}. */
export function loadUnits(country) {
  if (ready.has(country)) return Promise.resolve(ready.get(country));
  if (!loading.has(country))
    loading.set(
      country,
      loadSubdivisions(country).then(
        async (t) => {
          const feats = feature(t, t.objects.u).features;
          if (nextGid + feats.length > MAX_GID) throw new Error('too many subdivisions loaded');
          feats.forEach((f) => {
            f.bb = geoBounds(f);
            f.gid = ++nextGid;
          });
          // the same 4-degree grid as the country mesh, so long edges follow the sphere
          const mesh = await triangulate(feats, earcut, 4, tick, feats.map((f) => f.gid));
          const U = { feats, byCode: new Map(feats.map((f) => [f.properties.c, f])), mesh: { ll: mesh.ll, id: mesh.id, idx: mesh.idx } };
          ready.set(country, U);
          loading.delete(country);
          uploadMeshes();
          redraw();
          return U;
        },
        (e) => {
          loading.delete(country);
          throw e;
        },
      ),
    );
  return loading.get(country);
}
/** Load every country that has painted units (before an export, after opening a map). */
export const loadPainted = () => Promise.all([...paintedCountries()].map((c) => loadUnits(c).catch(() => null)));

function inBounds(f, g) {
  const b = f.bb;
  if (g[1] < b[0][1] - 0.01 || g[1] > b[1][1] + 0.01) return false;
  const x0 = b[0][0],
    x1 = b[1][0];
  return x0 <= x1 ? g[0] >= x0 - 0.01 && g[0] <= x1 + 0.01 : g[0] >= x0 - 0.01 || g[0] <= x1 + 0.01;
}
/** The loaded unit of a country at a lon/lat, or null. */
export function unitAtLL(country, g) {
  const U = ready.get(country);
  return U && g && !inSea(g[0], g[1]) ? U.feats.find((f) => inBounds(f, g) && geoContains(f, g)) || null : null;
}
/** The units a click on f paints at the current detail: its region or part where the country has them, else f alone. */
export function targetsOf(country, f) {
  const k = app.sub.detail,
    v = f.properties[k];
  if (k === 'u' || !v || !(geo.a1index[country].gr || {})[k]) return [f];
  return ready.get(country).feats.filter((x) => x.properties[k] === v);
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
/** Paint the units at a lon/lat in a country as one undo step, loading them first if needed. */
export async function clickUnits(country, g) {
  await loadUnits(country);
  const f = unitAtLL(country, g);
  if (!f || !paintUnits(country, targetsOf(country, f))) return;
  emit('legend');
  redraw();
  commit();
}
