// Export projections: the globe as shown, world maps, and regional maps fitted to what is on screen.
import {
  geoOrthographic,
  geoEqualEarth,
  geoNaturalEarth1,
  geoMercator,
  geoConicConformal,
  geoConicEqualArea,
  geoAzimuthalEqualArea,
  geoPath,
} from 'd3-geo';
import { geoRobinson, geoWinkel3 } from 'd3-geo-projection';
import { app } from './store.js';
import { geoAt } from './view.js';

/**
 * kind: 'globe' (orthographic), 'world' (whole-world flat maps), 'regional' (best for an area).
 * make(centreLon, area) returns an unfitted d3 projection; area is {lat0, lat1} for conics.
 */
export const PROJECTIONS = {
  ortho: { name: 'Globe (orthographic)', kind: 'globe', make: () => geoOrthographic().clipAngle(90) },
  equalearth: { name: 'Equal Earth', kind: 'world', make: () => geoEqualEarth() },
  robinson: { name: 'Robinson', kind: 'world', make: () => geoRobinson() },
  winkel3: { name: 'Winkel tripel', kind: 'world', make: () => geoWinkel3() },
  naturalearth: { name: 'Natural Earth', kind: 'world', make: () => geoNaturalEarth1() },
  mercator: { name: 'Mercator', kind: 'world', make: () => geoMercator() },
  lcc: { name: 'Lambert conformal conic', kind: 'regional', make: (a) => geoConicConformal().parallels(parallels(a)) },
  albers: { name: 'Albers equal-area conic', kind: 'regional', make: (a) => geoConicEqualArea().parallels(parallels(a)) },
  laea: { name: 'Lambert azimuthal equal-area', kind: 'regional', make: () => geoAzimuthalEqualArea() },
};

// Standard parallels at one sixth and five sixths of the area's latitude range (the usual rule).
function parallels(a) {
  const d = a.lat1 - a.lat0;
  let p0 = a.lat0 + d / 6,
    p1 = a.lat1 - d / 6;
  // a conic needs non-zero, same-hemisphere-ish parallels; nudge away from the equator
  if (Math.abs(p0 + p1) < 1) p1 = p0 + Math.sign(p0 || 1) * Math.max(1, Math.abs(d) / 3);
  return [p0, p1];
}

const wrap = (x) => ((((x + 180) % 360) + 360) % 360) - 180;
const fmt = (v, pos, neg) => Math.abs(Math.round(v * 10) / 10) + '°' + (v >= 0 ? pos : neg);

/** lon/lat points covering what is visible on screen (sampled on a grid). */
export function visiblePoints() {
  const pts = [],
    n = 36;
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= n; j++) {
      const g = geoAt((app.W * i) / n, (app.H * j) / n);
      if (g) pts.push(g);
    }
  return pts;
}

/**
 * Projection and canvas size for an export.
 * opts: {proj: key, area: 'screen'|'world', width}
 * Returns {p, W, H, kind, globe:{cx, cy, R}|null, label} where label describes the projection.
 */
export function exportView(opts) {
  const def = PROJECTIONS[opts.proj] || PROJECTIONS.ortho,
    lon0 = wrap(-app.rot[0]),
    lat0 = Math.max(-90, Math.min(90, -app.rot[1]));
  const sphere = { type: 'Sphere' };
  // the globe exactly as on screen
  if (def.kind === 'globe' && opts.area !== 'world') {
    const R = (Math.min(app.W, app.H) / 2) * 0.94 * app.zoom;
    const p = geoOrthographic()
      .clipAngle(90)
      .translate([app.W / 2, app.H / 2])
      .scale(R)
      .rotate([app.rot[0], app.rot[1], 0]);
    return { p, W: Math.round(app.W), H: Math.round(app.H), kind: 'globe', globe: { cx: app.W / 2, cy: app.H / 2, R }, label: 'orthographic, centred ' + fmt(lon0, 'E', 'W') + ' ' + fmt(lat0, 'N', 'S') };
  }
  const W = Math.round(Math.max(200, Math.min(8000, opts.width || (def.kind === 'globe' ? 800 : 1600)))),
    m = Math.round(W * 0.012) + 2;
  if (def.kind === 'globe') {
    const p = def.make().rotate([app.rot[0], app.rot[1], 0]).fitExtent([[m, m], [W - m, W - m]], sphere);
    return { p, W, H: W, kind: 'globe', globe: { cx: W / 2, cy: W / 2, R: p.scale() }, label: 'orthographic, centred ' + fmt(lon0, 'E', 'W') + ' ' + fmt(lat0, 'N', 'S') };
  }
  if (def.kind === 'world' && opts.area === 'world') {
    const p = def.make().rotate([-lon0, 0]);
    const target = opts.proj === 'mercator' ? mercatorWorld(lon0) : sphere;
    p.fitWidth(W - 2 * m, target);
    const b = geoPath(p).bounds(target),
      H = Math.round(b[1][1] - b[0][1] + 2 * m);
    p.fitExtent([[m, m], [W - m, H - m]], target);
    if (opts.proj === 'mercator') p.clipExtent([[0, 0], [W, H]]);
    return { p, W, H, kind: 'world', globe: null, label: def.name + ', central meridian ' + fmt(lon0, 'E', 'W') };
  }
  // fitted to the visible area (regional projections always are)
  const pts = visiblePoints();
  if (pts.length < 3) throw new Error('nothing of the globe is on screen');
  let la0 = 90,
    la1 = -90;
  for (const q of pts) {
    la0 = Math.min(la0, q[1]);
    la1 = Math.max(la1, q[1]);
  }
  const area = { lat0: la0, lat1: la1 };
  const p = def.make(area);
  if (opts.proj === 'laea') p.rotate([-lon0, -lat0]);
  else p.rotate([-lon0, 0]);
  const target = { type: 'MultiPoint', coordinates: pts };
  p.fitWidth(W - 2 * m, target);
  const b = geoPath(p).bounds(target),
    H = Math.round(Math.min(W * 3, b[1][1] - b[0][1] + 2 * m));
  p.fitExtent([[m, m], [W - m, H - m]], target);
  p.clipExtent([[0, 0], [W, H]]);
  let label = def.name;
  if (def.kind === 'regional' && opts.proj !== 'laea') {
    const [s0, s1] = p.parallels();
    label += ', standard parallels ' + fmt(s0, 'N', 'S') + ' and ' + fmt(s1, 'N', 'S') + ', central meridian ' + fmt(lon0, 'E', 'W');
  } else if (opts.proj === 'laea') label += ', centred ' + fmt(lon0, 'E', 'W') + ' ' + fmt(lat0, 'N', 'S');
  else label += ', central meridian ' + fmt(lon0, 'E', 'W');
  return { p, W, H, kind: def.kind, globe: null, label };
}

// Mercator cannot show the poles; the usual world crop is 85°S to 85°N.
const mercatorWorld = (lon0) => ({
  type: 'MultiPoint',
  coordinates: [
    [lon0 - 179.9, -85],
    [lon0 + 179.9, 85],
  ],
});
