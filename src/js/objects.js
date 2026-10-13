// Map objects drawn on top of country fills: freehand regions, exact outlines ('shape'),
// arrows, text labels and markers. All live in app.objects, in drawing order.
import { geoContains, geoInterpolate } from 'd3-geo';
import { merge } from 'topojson-client';
import { app, emit, redraw } from './store.js';
import { geo, ALIAS, fetchJSON } from './data.js';
import { ringPolygon, labelAnchor, largestRing } from './shapes.js';
import { geoAt, onFront, setProj, proj } from './view.js';
import { note } from './util.js';

export const KIND = { region: 'region', arrow: 'arrow', text: 'text label', marker: 'marker', shape: 'exact outline' };
export const TYPES = Object.keys(KIND);
export const isRegion = (r) => !r.t || r.t === 'region';
export const isArea = (r) => isRegion(r) || r.t === 'shape';
/** Fewest points an object of this type can have. */
export const minPts = (r) => (isRegion(r) ? 3 : r.t === 'arrow' ? 2 : r.t === 'shape' ? 0 : 1);

let nextId = 0;
export function newObj(t, pts, col, props) {
  return Object.assign(
    {
      id: ++nextId,
      t,
      pts,
      col,
      op: 0.45,
      lw: 1.8,
      dash: false, // fill opacity, outline width, dashed
      label: '',
      sn: true,
      fs: t === 'marker' ? 13 : 15, // name, show name on map, font size
      aw: 3,
      head: 'end',
      sm: true, // arrow width, head, smooth
      rot: 0,
      it: false, // text rotation, italic
      sym: 'dot',
      ms: 6.5, // marker symbol and size
    },
    props || {},
  );
}

// ---- exact outlines: geometry is rebuilt from a reference and cached
const subdivisions = new Map(),
  shapeCache = new Map();
/** Load one country's subdivision topology (cached; returns a promise). */
export function loadSubdivisions(country) {
  const info = geo.a1index[country];
  if (!info) return Promise.reject(new Error('No subdivisions for ' + country));
  if (!subdivisions.has(country)) {
    const p = fetchJSON('admin1/' + info.f).then(
      (t) => (subdivisions.set(country, t), t),
      (e) => {
        subdivisions.delete(country);
        throw e;
      },
    );
    subdivisions.set(country, p);
  }
  return Promise.resolve(subdivisions.get(country));
}
function shapeEntry(r) {
  const key = JSON.stringify(r.ref);
  if (shapeCache.has(key)) return shapeCache.get(key);
  const ref = r.ref;
  let g = null;
  if (ref.k === 'c') {
    const set = new Set(ref.names);
    g = merge(
      geo.topo,
      geo.topo.objects.countries.geometries.filter((x) => x.properties && set.has(ALIAS[x.properties.name] || x.properties.name)),
    );
  } else if (ref.k === 'a1') {
    const t = subdivisions.get(ref.c);
    if (!t || t instanceof Promise) {
      if (!t)
        loadSubdivisions(ref.c).then(
          () => {
            emit('objects');
            redraw();
          },
          () => note('Could not load the subdivisions for ' + ref.c + '. Open the page through a web server (see README).', 1),
        );
      return null;
    }
    const ids = new Set(ref.ids);
    g = merge(
      t,
      t.objects.u.geometries.filter((x) => ids.has(x.id)),
    );
  }
  if (!g || !g.coordinates.length) return null;
  const e = { geo: g, ring: largestRing(g) };
  if (shapeCache.size > 300) shapeCache.clear();
  shapeCache.set(key, e);
  return e;
}
export const shapeReady = (r) => !!shapeEntry(r);
/** GeoJSON geometry of an area object (region or exact outline), or null if not ready. */
export function areaGeo(r) {
  if (isRegion(r)) return r.pts.length > 2 ? ringPolygon(r.pts) : null;
  if (r.t === 'shape') {
    const e = shapeEntry(r);
    return e && e.geo;
  }
  return null;
}
/** Where to draw an area's name. */
export function areaAnchor(r) {
  if (isRegion(r)) return r.pts.length > 2 ? labelAnchor(r.pts) : null;
  const e = shapeEntry(r);
  return e ? labelAnchor(e.ring) : null;
}
/** Topmost area object under a canvas pixel, -1 if none. */
export function objectAt(x, y) {
  const g = geoAt(x, y);
  if (!g || !app.layers.regions) return -1;
  for (let i = app.objects.length - 1; i >= 0; i--) {
    const r = app.objects[i];
    if (!isArea(r)) continue;
    const a = areaGeo(r);
    if (a && geoContains(a, g)) return i;
  }
  return -1;
}
/** Handle under the pointer on the selected object: {v:i} vertex, {m:i} segment midpoint. */
export function handleAt(x, y) {
  const r = app.objects[app.sel];
  if (!r || app.drawing) return null;
  setProj();
  const near = (g) => {
    if (!onFront(g)) return false;
    const p = proj(g);
    return Math.hypot(p[0] - x, p[1] - y) < 9;
  };
  for (let i = 0; i < r.pts.length; i++) if (near(r.pts[i])) return { v: i };
  if (r.pts.length > 1)
    for (let i = 0; i < (isRegion(r) ? r.pts.length : r.pts.length - 1); i++)
      if (near(geoInterpolate(r.pts[i], r.pts[(i + 1) % r.pts.length])(0.5))) return { m: i };
  return null;
}
