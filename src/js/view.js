// Camera: orthographic projection matching the GL renderer, screen <-> lon/lat, zoom and animation.
import { geoOrthographic, geoDistance } from 'd3-geo';
import { app, redraw } from './store.js';
import { D, clamp } from './util.js';
import { idAtLL } from './data.js';

const globe = geoOrthographic().clipAngle(90);
/**
 * The projection the 2D drawing code uses. Normally the on-screen globe; exports can swap in
 * another one for the duration of a synchronous draw with withProjection().
 */
export let proj = globe;
let override = null; // {flat, scale} while an export projection is active
/** Globe radius in CSS pixels. */
export const Rb = () => (Math.min(app.W, app.H) / 2) * 0.94 * app.zoom;
/** Point d3's projection at the current view (call before using proj). */
export const setProj = () =>
  override
    ? proj
    : proj
        .translate([app.W / 2, app.H / 2])
        .scale(Rb())
        .rotate([app.rot[0], app.rot[1], 0]);
/** Pixels per radian near the centre: globe radius on screen, projection scale otherwise. */
export const pxPerRad = () => (override ? override.scale : Rb());
/** True while drawing through a flat (non-azimuthal) projection. */
export const isFlat = () => !!(override && override.flat);
/** Run fn with p as the drawing projection. flat: whole-world flat maps skip hemisphere tests. */
export function withProjection(p, flat, fn) {
  const prev = proj;
  proj = p;
  override = { flat, scale: p.scale() };
  try {
    return fn();
  } finally {
    proj = prev;
    override = null;
  }
}
/** lon/lat under a canvas pixel, or null off the globe. */
export function geoAt(x, y) {
  setProj();
  const R = Rb(),
    dx = x - app.W / 2,
    dy = y - app.H / 2;
  if (dx * dx + dy * dy > R * R * 0.9999) return null;
  const g = proj.invert([x, y]);
  return g && g.every(Number.isFinite) ? g : null;
}
/** Is a lon/lat on the visible hemisphere? */
export const onFront = (g) => {
  if (override && override.flat) return true;
  const r = proj.rotate();
  return geoDistance(g, [-r[0], -r[1]]) < Math.PI / 2 - 1e-3;
};

/** Country id under a canvas pixel (0 = sea or off-globe). */
export function idAtPx(px, py) {
  const R = Rb(),
    x = (px - app.W / 2) / R,
    y = -(py - app.H / 2) / R,
    r2 = x * x + y * y;
  if (r2 > 1) return 0;
  const z = Math.sqrt(1 - r2),
    a = -app.rot[0] * D,
    b = -app.rot[1] * D;
  const ca = Math.cos(a),
    sa = Math.sin(a),
    cb = Math.cos(b),
    sb = Math.sin(b);
  const wx = z * cb * ca - x * sa - y * sb * ca,
    wy = z * cb * sa + x * ca - y * sb * sa,
    wz = z * sb + y * cb;
  return idAtLL(Math.atan2(wy, wx) / D, Math.asin(clamp(wz, -1, 1)) / D);
}

export function setZoom(z) {
  app.zoom = clamp(z, 0.8, 40);
  redraw();
}
/** Ease the view to a rotation [lambda, phi] over 700 ms. */
export function animate(target) {
  const a = app.rot.slice(),
    t0 = performance.now(),
    dl = ((target[0] - a[0] + 540) % 360) - 180;
  (function step(t) {
    const k = Math.min(1, (t - t0) / 700),
      e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    app.rot = [a[0] + dl * e, a[1] + (target[1] - a[1]) * e];
    redraw();
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}
/** Rotation that centres a lon/lat. */
export const centreOn = (c) => [-c[0], clamp(-c[1], -90, 90)];
