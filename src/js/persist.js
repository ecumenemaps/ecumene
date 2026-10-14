// Saving and loading: the map state object, map codes (GM1.<deflate+base64url>), files and autosave.
import { app, emit, redraw, STYLE_COLOR_KEYS, LAKE_MODES } from './store.js';
import { geo } from './data.js';
import { setFill, legendColours } from './paint.js';
import { newObj, TYPES } from './objects.js';
import { commit } from './history.js';
import { FONTS, loadFont } from './fonts.js';
import { hexOk, clamp } from './util.js';
import { OVERSEAS } from '../overseas.js';
import { hasUnits, setUnit, splitKey, loadPainted } from './units.js';
import { SCALES, PAINT_SETS } from './schemes.js';
import { validRecord } from './stats.js';
import { electionById } from './seats.js';
import { validImport } from './table.js';
// a paint is a hex color or a pattern (patterns.js)
import { paintOk } from './patterns.js';

// Natural Earth adm1_code, such as GBR-2083 (a few read like RUS+99?), or ALD+0 for the "Rest of" unit the build
// adds where no subdivision covers part of a country (an overseas part's file adds digits: NLD535+0)
const UNIT_CODE = /^[A-Z]{3}[0-9]{0,3}[-+][0-9?]{1,6}$/;
// a unit of another layer (layers/index.json): the layer id, a colon and the publisher's code, gb-wpc-2024:E14001063
const LAYER_CODE = /^([a-z0-9-]{1,40}):([A-Za-z0-9_.+-]{1,64})$/;
const unitCodeOk = (country, code) => {
  if (UNIT_CODE.test(code)) return !!geo.a1index[country];
  const m = LAYER_CODE.exec(code);
  return !!m && (geo.layers[country] || []).some((x) => x.id === m[1]);
};

const AUTOSAVE_KEY = 'globeMap1';
// Map data version. 'ne10m' maps were saved before French Guiana, Réunion, the Caribbean Netherlands and the
// other overseas parts were split from France and the Netherlands; loading one paints each part like its parent.
const DATA = 'ne10m-2';
/** Names to add for a pre-split map: the overseas parts whose parent is in names. */
const splitParts = (names) => OVERSEAS.filter((p) => names.includes(p.parent) && !names.includes(p.name)).map((p) => p.name);

/** Plain, JSON-serialisable description of the whole map. */
export function getState() {
  const groups = {},
    units = {}; // colour -> country -> codes
  app.fills.forEach((c, n) => (groups[c] = groups[c] || []).push(n));
  app.units.forEach((c, k) => {
    const [n, code] = splitKey(k),
      g = (units[c] = units[c] || {});
    (g[n] = g[n] || []).push(code);
  });
  const used = new Set([...app.fills.values(), ...app.units.values()]),
    L = app.legend;
  return {
    v: 1,
    d: DATA,
    f: Object.entries(groups).map(([c, n]) => ({ c, n, l: app.labels[c] || '' })),
    u: Object.entries(units).map(([c, k]) => ({ c, k, l: app.labels[c] || '' })),
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
    lg: { t: L.title, p: L.pos, xy: L.xy, k: L.scale, s: L.show, n: L.note, o: L.order.filter((c) => used.has(c)) },
    sb: { s: app.seatbar.show, p: app.seatbar.pos, xy: app.seatbar.xy, k: app.seatbar.scale, e: app.seatbar.el },
    sl: { s: app.sublines.on, c: app.sublines.col, w: app.sublines.w, g: app.sublines.gw },
    ps: app.paintSet,
    ...(app.fictional ? { fi: true } : {}),
    ds: Object.assign({}, app.data),
    // the statistic and the numbers used, so the map never changes when it is reopened or shared
    ...(app.stat ? { st: app.stat } : {}),
    // or the rows of your own data it was colored with, and where they came from
    ...(app.imported ? { im: app.imported } : {}),
    r: [+app.rot[0].toFixed(2), +app.rot[1].toFixed(2)],
    z: +app.zoom.toFixed(2),
  };
}

function parseObject(g, preSplit) {
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
      if (preSplit) names.push(...splitParts(names));
      ref = { k: 'c', names };
    } else if (f.k === 'a1' && typeof f.c === 'string' && Array.isArray(f.ids)) {
      // y: the layer of the units (absent for Natural Earth's admin-1)
      const y = typeof f.y === 'string' ? f.y : '';
      if (y ? !(geo.layers[f.c] || []).some((x) => x.id === y) : !geo.a1index[f.c]) return null;
      const ids = f.ids.filter(Number.isInteger);
      if (!ids.length) return null;
      ref = y ? { k: 'a1', c: f.c, y, ids } : { k: 'a1', c: f.c, ids };
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
  const preSplit = o.d !== DATA;
  for (const g of o.f) {
    if (!g || !paintOk(g.c) || !Array.isArray(g.n)) continue;
    const c = g.c.toLowerCase();
    if (g.l) app.labels[c] = String(g.l).slice(0, 60);
    for (const n of preSplit ? g.n.concat(splitParts(g.n)) : g.n) {
      if (geo.nameId.has(n)) setFill(n, c);
      else skipped++;
    }
  }
  app.units.clear();
  // each country is painted with the layer of its saved paint
  for (const k in app.sub.layer) delete app.sub.layer[k];
  if (Array.isArray(o.u))
    for (const g of o.u) {
      if (!g || !paintOk(g.c) || !g.k || typeof g.k !== 'object') continue;
      const c = g.c.toLowerCase();
      if (g.l && !app.labels[c]) app.labels[c] = String(g.l).slice(0, 60);
      for (const n of Object.keys(g.k)) {
        if (!hasUnits(n) || !Array.isArray(g.k[n])) {
          skipped++;
          continue;
        }
        for (const code of g.k[n]) if (typeof code === 'string' && unitCodeOk(n, code)) setUnit(n, code, c);
      }
    }
  // their outlines arrive after the first frame
  if (app.units.size)
    loadPainted().then(() => {
      emit('legend');
      redraw();
    });
  const s = o.s || {},
    S = app.style;
  STYLE_COLOR_KEYS.forEach((k) => {
    if (hexOk(s[k])) S[k] = s[k].toLowerCase();
  });
  if (!hexOk(s.rim)) S.rim = S.border; // maps saved before the globe edge had its own colour
  if (Number.isFinite(s.bw)) S.bw = clamp(s.bw, 0.5, 3);
  if (Number.isFinite(s.shade)) S.shade = clamp(s.shade, 0, 1);
  S.font = FONTS[s.font] ? s.font : 'sys';
  // subdivision borders: off in maps saved before they existed
  const sl = o.sl && typeof o.sl === 'object' ? o.sl : {},
    SL = app.sublines;
  SL.on = sl.s === true;
  SL.col = hexOk(sl.c) ? sl.c.toLowerCase() : '#ffffff';
  SL.w = Number.isFinite(sl.w) ? clamp(sl.w, 0.3, 4) : 0.6;
  SL.gw = Number.isFinite(sl.g) ? clamp(sl.g, 0.3, 4) : 2;
  loadFont();
  if (o.L) {
    for (const k in app.layers) if (k !== 'lakes' && typeof o.L[k] === 'boolean') app.layers[k] = o.L[k];
    // Older maps stored lakes as on/off; "on" meant every lake.
    const lk = o.L.lakes;
    if (LAKE_MODES.includes(lk)) app.layers.lakes = lk;
    else if (typeof lk === 'boolean') app.layers.lakes = lk ? 'all' : 'none';
  }
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
      const r = parseObject(g, preSplit);
      if (r) app.objects.push(r);
    }
  const L = app.legend,
    lg = o.lg && typeof o.lg === 'object' ? o.lg : {};
  L.title = typeof lg.t === 'string' ? lg.t.slice(0, 80) : '';
  L.pos = ['tl', 'tr', 'bl', 'br'].includes(lg.p) ? lg.p : 'bl';
  L.show = lg.s !== false;
  L.note = lg.n !== false;
  L.xy = Array.isArray(lg.xy) && lg.xy.length === 2 && lg.xy.every(Number.isFinite) ? lg.xy.map((v) => clamp(v, 0, 1)) : null;
  L.scale = Number.isFinite(lg.k) ? clamp(lg.k, 0.5, 2.5) : 1;
  L.order = Array.isArray(lg.o) ? lg.o.filter(paintOk).map((c) => c.toLowerCase()) : [];
  // the seat counter (maps saved before it get the defaults)
  const sb = o.sb && typeof o.sb === 'object' ? o.sb : {},
    B = app.seatbar;
  B.show = sb.s !== false;
  B.pos = sb.p === 'bc' ? 'bc' : 'tc';
  B.xy = Array.isArray(sb.xy) && sb.xy.length === 2 && sb.xy.every(Number.isFinite) ? sb.xy.map((v) => clamp(v, 0, 1)) : null;
  B.scale = Number.isFinite(sb.k) ? clamp(sb.k, 0.5, 2.5) : 1;
  B.el = typeof sb.e === 'string' && electionById(sb.e) ? sb.e : '';
  // paint swatch set and color-by-data settings (maps saved before them get the defaults)
  app.paintSet = PAINT_SETS[o.ps] ? o.ps : 'Default';
  app.fictional = o.fi === true;
  const ds = o.ds && typeof o.ds === 'object' ? o.ds : {};
  Object.assign(app.data, {
    scale: SCALES[ds.scale] ? ds.scale : 'Blues',
    n: Number.isInteger(ds.n) ? clamp(ds.n, 2, 9) : 5,
    // a map keeps the method it was made with; maps saved before methods were saved get natural breaks
    m: ['jenks', 'quantile', 'equal'].includes(ds.m) ? ds.m : 'jenks',
    c: typeof ds.c === 'string' && (ds.c === '' || Number.isFinite(+ds.c)) ? ds.c.slice(0, 30) : '',
    rev: !!ds.rev,
    nd: ds.nd !== false,
  });
  app.stat = validRecord(o.st);
  app.imported = app.stat ? null : validImport(o.im);
  emit('stat');
  emit('import');
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
/** Load the map saved in this browser. With load=false, start fresh but only overwrite it once something changes. */
export function restoreAutosave(load = true) {
  try {
    const s = load && localStorage.getItem(AUTOSAVE_KEY);
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
