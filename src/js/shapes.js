// Pure spherical geometry for regions, arrows and labels. No DOM, no app state, unit tested.
import { geoArea, geoCentroid, geoAzimuthalEqualArea, geoInterpolate } from 'd3-geo';
import { V, D, clamp } from './util.js';

/** GeoJSON polygon for a ring of points, wound so it covers the smaller side of the sphere. */
export function ringPolygon(pts) {
  const ring = pts.concat([pts[0]]);
  const g = { type: 'Polygon', coordinates: [ring] };
  return geoArea(g) > 2 * Math.PI ? { type: 'Polygon', coordinates: [ring.slice().reverse()] } : g;
}

const anchorCache = new Map();
/**
 * A point well inside a ring, for placing its name: a coarse-to-fine search for the point
 * farthest from the edges (pole of inaccessibility) in a local equal-area projection.
 */
export function labelAnchor(pts) {
  const key = JSON.stringify(pts);
  if (anchorCache.has(key)) return anchorCache.get(key);
  const g = ringPolygon(pts),
    c = geoCentroid(g);
  const pj = geoAzimuthalEqualArea().rotate([-c[0], -c[1]]).scale(1000).translate([0, 0]);
  const ring = g.coordinates[0].map((q) => pj(q));
  const inside = (x, y) => {
    let k = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i],
        b = ring[j];
      if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) k = !k;
    }
    return k;
  };
  const segDist = (x, y, a, b) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      l = dx * dx + dy * dy;
    const t = clamp(l ? ((x - a[0]) * dx + (y - a[1]) * dy) / l : 0, 0, 1);
    return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
  };
  const score = (x, y) => {
    if (!inside(x, y)) return -1;
    let m = Infinity;
    for (let i = 0; i < ring.length - 1; i++) m = Math.min(m, segDist(x, y, ring[i], ring[i + 1]));
    return m;
  };
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const q of ring) {
    x0 = Math.min(x0, q[0]);
    x1 = Math.max(x1, q[0]);
    y0 = Math.min(y0, q[1]);
    y1 = Math.max(y1, q[1]);
  }
  let best = [0, 0],
    bs = score(0, 0),
    step = Math.max(x1 - x0, y1 - y0) / 24;
  for (let x = x0; x <= x1; x += step)
    for (let y = y0; y <= y1; y += step) {
      const v = score(x, y);
      if (v > bs) {
        bs = v;
        best = [x, y];
      }
    }
  for (let k = 0; k < 5; k++) {
    step /= 3;
    const [bx, by] = best;
    for (let dx = -3; dx <= 3; dx++)
      for (let dy = -3; dy <= 3; dy++) {
        const v = score(bx + dx * step, by + dy * step);
        if (v > bs) {
          bs = v;
          best = [bx + dx * step, by + dy * step];
        }
      }
  }
  const a = pj.invert(best) || c;
  if (anchorCache.size > 200) anchorCache.clear();
  anchorCache.set(key, a);
  return a;
}

/** Smooth curve through points on the sphere (Catmull-Rom on unit vectors, 16 samples per span). */
export function smoothPath(pts) {
  if (pts.length < 3) return pts;
  const P = pts.map((q) => V(q[0], q[1])),
    o = [];
  const at = (i) => P[clamp(i, 0, P.length - 1)];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = at(i - 1),
      p1 = at(i),
      p2 = at(i + 1),
      p3 = at(i + 2);
    for (let k = 0; k < 16; k++) {
      const t = k / 16,
        t2 = t * t,
        t3 = t2 * t;
      const v = [0, 1, 2].map(
        (d) =>
          0.5 *
          (2 * p1[d] +
            (-p0[d] + p2[d]) * t +
            (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 +
            (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3),
      );
      const n = Math.hypot(...v);
      o.push([Math.atan2(v[1], v[0]) / D, Math.asin(clamp(v[2] / n, -1, 1)) / D]);
    }
  }
  o.push(pts[pts.length - 1]);
  return o;
}
/** Dense polyline for an arrow: smoothed, or great-circle segments densified so the head follows the curve. */
export function arrowLine(pts, smooth) {
  if (smooth) return smoothPath(pts);
  const o = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const f = geoInterpolate(pts[i], pts[i + 1]);
    for (let k = 0; k < 16; k++) o.push(f(k / 16));
  }
  o.push(pts[pts.length - 1]);
  return o;
}
/** Outer ring of the largest polygon in a MultiPolygon (without the closing point). */
export function largestRing(multi) {
  let best = null,
    ba = -1;
  for (const poly of multi.coordinates) {
    const a = geoArea({ type: 'Polygon', coordinates: [poly[0]] }),
      aa = a > 2 * Math.PI ? 4 * Math.PI - a : a;
    if (aa > ba) {
      ba = aa;
      best = poly[0];
    }
  }
  return best ? best.slice(0, -1) : null;
}
