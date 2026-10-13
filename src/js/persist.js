// Saving and loading: the map state object, map codes (GM1.<deflate+base64url>), files and autosave.
import { app, emit, redraw, STYLE_COLOR_KEYS } from './store.js';
import { geo } from './data.js';
import { setFill, legendColours } from './paint.js';
import { newObj, TYPES } from './objects.js';
import { commit } from './history.js';
import { FONTS, loadFont } from './fonts.js';
import { hexOk, clamp } from './util.js';

const AUTOSAVE_KEY = 'globeMap1';

/** Plain, JSON-serialisable description of the whole map. */
export function getState() {
  const groups = {};
  app.fills.forEach((c, n) => (groups[c] = groups[c] || []).push(n));
  const used = new Set(app.fills.values()),
    L = app.legend;
  return {
    v: 1,
    d: 'ne10m',
    f: Object.entries(groups).map(([c, n]) => ({ c, n, l: app.labels[c] || '' })),
    s: Object.assign({}, app.style),
    L: Object.assign({}, app.layers),
    h: Object.assign({}, app.hoverStyle),
    g: app.objects.map((r) => ({
      t: r.t || 'region',
      p: r.pts.map((q) => [+q[0].toFixed(4), +q[1].toFixed(4)]),
      c: r.col,
      o: r.op,
      w: r.lw,
      d: r.dash,
      l: r.label,
      n: r.sn,
      s: r.fs,
      aw: r.aw,
      h: r.head,
      sm: r.sm,
      ro: r.rot,
      it: r.it,
      sy: r.sym,
      ms: r.ms,
      ref: r.ref,
    })),
    lg: { t: L.title, p: L.pos, s: L.show, o: L.order.filter((c) => used.has(c)) },
    r: [+app.rot[0].toFixed(2), +app.rot[1].toFixed(2)],
    z: +app.zoom.toFixed(2),
  };
}

function parseObject(g) {
  if (!g || !Array.isArray(g.p) || !hexOk(g.c)) return null;
  const t = TYPES.includes(g.t) ? g.t : 'region';
  const num = (v, a, b, d) => (Number.isFinite(v) ? clamp(v, a, b) : d);
  const pts = g.p
    .filter((q) => Array.isArray(q) && q.length === 2 && q.every(Number.isFinite))
    .map((q) => [clamp(q[0], -180, 180), clamp(q[1], -90, 90)]);
  let ref;
  if (t === 'shape') {
    const f = g.ref || {};
    if (f.k === 'c' && Array.isArray(f.names)) {
      const names = f.names.filter((x) => typeof x === 'string' && geo.nameId.has(x));
      if (!names.length) return null;
      ref = { k: 'c', names };
    } else if (f.k === 'a1' && typeof f.c === 'string' && geo.a1index[f.c] && Array.isArray(f.ids)) {
      const ids = f.ids.filter(Number.isInteger);
      if (!ids.length) return null;
      ref = { k: 'a1', c: f.c, ids };
    } else return null;
  } else if (pts.length < (t === 'region' ? 3 : t === 'arrow' ? 2 : 1)) return null;
  return newObj(t, t === 'text' || t === 'marker' ? pts.slice(0, 1) : pts, g.c.toLowerCase(), {
    op: num(g.o, 0, 1, 0.45),
    lw: num(g.w, 0, 6, 1.8),
    dash: !!g.d,
    label: typeof g.l === 'string' ? g.l.slice(0, 80) : '',
    sn: g.n !== false,
    fs: num(g.s, 8, 48, t === 'marker' ? 13 : 15),
    aw: num(g.aw, 1, 12, 3),
    head: ['end', 'both', 'none'].includes(g.h) ? g.h : 'end',
    sm: g.sm !== false,
    rot: num(g.ro, -90, 90, 0),
    it: !!g.it,
    sym: ['dot', 'square', 'triangle', 'star'].includes(g.sy) ? g.sy : 'dot',
    ms: num(g.ms, 2, 16, 6.5),
    ref,
  });
}

/** Replace the map with a saved state. Validates everything. Returns the number of unknown country names skipped. */
export function setState(o) {
  if (!o || typeof o !== 'object' || !Array.isArray(o.f)) throw new Error('This is not a map file or code.');
  [...app.fills.keys()].forEach((n) => setFill(n, null));
  for (const k in app.labels) delete app.labels[k];
  let skipped = 0;
  for (const g of o.f) {
    if (!g || !hexOk(g.c) || !Array.isArray(g.n)) continue;
    const c = g.c.toLowerCase();
    if (g.l) app.labels[c] = String(g.l).slice(0, 60);
    for (const n of g.n) {
      if (geo.nameId.has(n)) setFill(n, c);
      else skipped++;
    }
  }
  const s = o.s || {},
    S = app.style;
  STYLE_COLOR_KEYS.forEach((k) => {
    if (hexOk(s[k])) S[k] = s[k].toLowerCase();
  });
  if (Number.isFinite(s.bw)) S.bw = clamp(s.bw, 0.5, 3);
  if (Number.isFinite(s.shade)) S.shade = clamp(s.shade, 0, 1);
  S.font = FONTS[s.font] ? s.font : 'sys';
  loadFont();
  if (o.L) for (const k in app.layers) if (typeof o.L[k] === 'boolean') app.layers[k] = o.L[k];
  if (o.h) {
    const H = app.hoverStyle;
    H.dark = !!o.h.dark;
    H.outline = !!o.h.outline;
    H.tip = !!o.h.tip;
    if (Number.isFinite(o.h.amt)) H.amt = clamp(o.h.amt, 0.05, 0.4);
  }
  app.objects.length = 0;
  app.sel = -1;
  app.drawing = null;
  if (Array.isArray(o.g))
    for (const g of o.g) {
      const r = parseObject(g);
      if (r) app.objects.push(r);
    }
  const L = app.legend,
    lg = o.lg && typeof o.lg === 'object' ? o.lg : {};
  L.title = typeof lg.t === 'string' ? lg.t.slice(0, 80) : '';
  L.pos = ['tl', 'tr', 'bl', 'br'].includes(lg.p) ? lg.p : 'bl';
  L.show = lg.s !== false;
  L.order = Array.isArray(lg.o) ? lg.o.filter(hexOk) : [];
  legendColours();
  if (Array.isArray(o.r) && o.r.length === 2 && o.r.every(Number.isFinite)) app.rot = [o.r[0], clamp(o.r[1], -90, 90)];
  if (Number.isFinite(o.z)) app.zoom = clamp(o.z, 0.8, 40);
  emit('style');
  emit('objects');
  emit('legend');
  redraw();
  commit();
  return skipped;
}

// ---- map codes
const b64u = (u) => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const pipe = async (u, ts) => new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(ts)).arrayBuffer());
export const encode = async (state = getState()) =>
  'GM1.' + b64u(await pipe(new TextEncoder().encode(JSON.stringify(state)), new CompressionStream('deflate-raw')));
export async function decode(code) {
  code = code.trim().replace(/^.*[#?&]m=/, '');
  if (!code.startsWith('GM1.')) throw new Error('Unknown map code.');
  return JSON.parse(new TextDecoder().decode(await pipe(unb64u(code.slice(4)), new DecompressionStream('deflate-raw'))));
}

// ---- downloads: through the Claude artifact downloads capability when present, otherwise a normal download
let downloads = null;
(async () => {
  try {
    downloads = await window.claude.use('downloads');
  } catch (_) {
    downloads = null;
  }
})();
export async function saveBlob(filename, blob) {
  if (downloads) return downloads.save({ filename, data: blob });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---- autosave to this browser
let last = '';
export function restoreAutosave() {
  try {
    const s = localStorage.getItem(AUTOSAVE_KEY);
    if (s) setState(JSON.parse(s));
  } catch (_) {}
  last = JSON.stringify(getState());
}
export function startAutosave() {
  setInterval(() => {
    if (!app.ready) return;
    try {
      const s = JSON.stringify(getState());
      if (s !== last) {
        localStorage.setItem(AUTOSAVE_KEY, s);
        last = s;
      }
    } catch (_) {}
  }, 3000);
}
