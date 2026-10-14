// Cutting lakes out of country and subdivision shapes, shared by SVG export (src/js/export.js) and the test that
// runs the same cut over every country and subdivision file (tests/unit/cut.test.mjs). The clipper
// (polygon-clipping) is passed in, so the browser can load it only when exporting.
// The clipping is planar in lon/lat: each piece gets continuous longitudes first (a piece across 180° runs past it),
// lakes are moved into the same 360° window, and everything is snapped to 1e-5 degrees, the precision of the data
// files, which keeps the clipper away from near-coincident points (unsnapped, Brazil fails).

/** Lake polygons ([shore, ...islands]) for rings [0, toRing) of decoded phys data, or null without the ring list. */
function lakePolygons(p, toRing) {
  if (!p.lakePolys) return null;
  const out = [];
  let ring = 0,
    o = 0;
  for (let i = 0; i < p.lakePolys.length && ring < toRing; i++) {
    const poly = [];
    for (let k = 0; k < p.lakePolys[i]; k++, ring++) {
      const len = p.lakeLines.lens[ring],
        r = [];
      for (let m = 0; m < len; m++) r.push([p.lakeLines.pts[2 * (o + m)], p.lakeLines.pts[2 * (o + m) + 1]]);
      o += len;
      poly.push(r);
    }
    out.push(poly);
  }
  return out;
}

const snap = (v) => Math.round(v * 1e5) / 1e5;
const D = Math.PI / 180;
/**
 * d3 draws an edge as a great circle, the clipper as a straight line in lon/lat. Long edges (Sudan's border along
 * 22°N is one edge of 6°) get points along their great circle every 0.25° first, so a cut that adds a point on
 * such an edge keeps the shape d3 draws and the border line drawn over it.
 */
function densify(r) {
  const o = [r[0]];
  for (let i = 1; i < r.length; i++) {
    const a = r[i - 1],
      b = r[i],
      n = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / 0.25);
    if (n > 1 && Math.abs(b[0] - a[0]) < 180) {
      const va = [Math.cos(a[1] * D) * Math.cos(a[0] * D), Math.cos(a[1] * D) * Math.sin(a[0] * D), Math.sin(a[1] * D)],
        vb = [Math.cos(b[1] * D) * Math.cos(b[0] * D), Math.cos(b[1] * D) * Math.sin(b[0] * D), Math.sin(b[1] * D)],
        w = Math.acos(Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
      if (w > 1e-9)
        for (let k = 1; k < n; k++) {
          const t = k / n,
            s0 = Math.sin((1 - t) * w) / Math.sin(w),
            s1 = Math.sin(t * w) / Math.sin(w),
            v = [s0 * va[0] + s1 * vb[0], s0 * va[1] + s1 * vb[1], s0 * va[2] + s1 * vb[2]];
          o.push([Math.atan2(v[1], v[0]) / D, Math.asin(Math.max(-1, Math.min(1, v[2]))) / D]);
        }
    }
    o.push(b);
  }
  return o;
}
function unwrapRing(r) {
  const o = [];
  let off = 0,
    prev = r[0][0];
  for (const q of densify(r)) {
    let x = q[0] + off;
    while (x - prev > 180) {
      off -= 360;
      x -= 360;
    }
    while (prev - x > 180) {
      off += 360;
      x += 360;
    }
    prev = x;
    o.push([snap(x), snap(q[1])]);
  }
  // a ring around a pole (Antarctica) is closed through it, as in tri.js
  const F = o[0],
    L = o[o.length - 1];
  if (Math.abs(L[0] - F[0]) > 180) {
    const pole = F[1] + L[1] < 0 ? -90 : 90;
    o.push([L[0], pole], [F[0], pole], F);
  }
  return o;
}
/** A polygon with continuous, snapped longitudes; holes moved next to their outer ring. */
function unwrapPolygon(P) {
  const o = P.map(unwrapRing),
    ref = o[0][0][0];
  for (const r of o.slice(1)) {
    const k = Math.round((ref - r[0][0]) / 360);
    if (k) for (const q of r) q[0] += 360 * k;
  }
  return o;
}
function bboxOf(P) {
  let x0 = 1e9,
    y0 = 1e9,
    x1 = -1e9,
    y1 = -1e9;
  for (const [x, y] of P[0]) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}
/** Lake polygons ready for cutting: unwrapped and snapped, with bounding boxes. */
function prepareLakes(polys) {
  return polys.map((P) => {
    const u = unwrapPolygon(P);
    return { P: u, b: bboxOf(u) };
  });
}
const shift = (P, k) => P.map((r) => r.map((q) => [q[0] + k, q[1]]));
/**
 * The clipper drops points that lie in a straight line in lon/lat, which turns a border along a parallel (Sudan's
 * along 22°N) into one long edge that d3 would draw as a great circle. Put points back along such edges, every 0.25°
 * in lon/lat, which is what the clipper's straight edge meant.
 */
function refill(r) {
  const o = [r[0]];
  for (let i = 1; i < r.length; i++) {
    const a = r[i - 1],
      b = r[i],
      n = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / 0.25);
    for (let k = 1; k < n; k++) o.push([snap(a[0] + ((b[0] - a[0]) * k) / n), snap(a[1] + ((b[1] - a[1]) * k) / n)]);
    o.push(b);
  }
  return o;
}
// planar area of polygons, to tell whether a cut removed anything
const planar = (polys) =>
  polys.reduce(
    (s, P) =>
      s +
      P.reduce((t, r, i) => {
        let a = 0;
        for (let k = 0, j = r.length - 1; k < r.length; j = k++) a += (r[j][0] - r[k][0]) * (r[j][1] + r[k][1]);
        return t + (i ? -1 : 1) * Math.abs(a / 2);
      }, 0),
    0,
  );

/**
 * Cut lakes out of a GeoJSON Polygon or MultiPolygon geometry. Pieces no lake reaches are returned as they were;
 * a piece the clipper fails on is kept uncut and counted in `failed`, so land is never lost.
 * Returns {geometry, cut, failed}: cut is how many pieces changed.
 */
function cutLakes(geometry, lakes, pc) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates,
    out = [];
  let cut = 0,
    failed = 0;
  for (const P of polys) {
    const u = unwrapPolygon(P),
      b = bboxOf(u),
      near = [];
    for (const L of lakes)
      for (const k of [0, 360, -360])
        if (L.b[0] + k < b[2] && L.b[2] + k > b[0] && L.b[1] < b[3] && L.b[3] > b[1]) near.push(k ? shift(L.P, k) : L.P);
    if (!near.length) {
      out.push(P);
      continue;
    }
    let d;
    try {
      d = pc.difference(u, ...near);
    } catch (e) {
      failed++;
      out.push(P);
      continue;
    }
    // a lake whose box reaches the piece but not the piece itself leaves it exactly as it was
    if (Math.abs(planar(d) - planar([u])) <= 1e-9 * Math.abs(planar([u])) + 1e-12) {
      out.push(P);
      continue;
    }
    cut++;
    // polygon-clipping winds outer rings anticlockwise; d3 reads rings on the sphere the other way round
    for (const Q of d) out.push(Q.map((r) => refill(r).reverse()));
  }
  return { geometry: { type: 'MultiPolygon', coordinates: out }, cut, failed };
}

if (typeof module !== 'undefined') module.exports = { lakePolygons, prepareLakes, cutLakes };
