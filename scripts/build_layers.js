// Builds the paintable boundary layers listed in scripts/sources/ (kind "layer") from their raw downloads in
// data/src/ (fetched by scripts/fetch_sources.js) into data/layers/<id>/<file>.json, one TopoJSON per country, and
// data/layers/index.json, which the editor reads: per country, the layers it offers, with their credits.
// Run: node scripts/build_layers.js [id...]
//
// Each unit is fitted to the map's own country outline (Natural Earth 10m), so paint never spills into the sea where
// the publisher's coastline runs further out: a unit wholly inside the country is kept as it is, one that reaches past
// it is cut back to it, and pieces left under MIN_KM2 are dropped. The build reports how much of the country the
// units cover; the rest (where the publisher's coast runs further in) shows the country's own colour.
const fs = require('fs'),
  path = require('path'),
  ts = require('topojson-server'),
  tj = require('topojson-client'),
  pc = require('polygon-clipping'),
  zlib = require('zlib'),
  { geoArea, geoCentroid, geoContains, geoDistance, geoLength } = require('d3-geo');
const { layers, partsOf } = require('./lib/sources.js');
const { splitOverseas } = require('../src/overseas.js');
const R = (p) => path.join(__dirname, '..', p);
const MIN_KM2 = 0.5,
  R2 = 6371 * 6371;

const ALIAS = { Baikonur: 'Kazakhstan', 'USNB Guantanamo Bay': 'Cuba' };
const world = splitOverseas(require('world-atlas/countries-10m.json'), tj.feature);
const countryPolys = new Map();
for (const f of tj.feature(world, world.objects.countries).features) {
  if (!f.geometry) continue;
  const n = ALIAS[f.properties.name] || f.properties.name,
    g = f.geometry;
  if (!countryPolys.has(n)) countryPolys.set(n, []);
  countryPolys.get(n).push(...(g.type === 'Polygon' ? [g.coordinates] : g.coordinates));
}
// subdivision files are named after the country's code in the admin-1 index (GBR.json); reuse those names
const a1 = JSON.parse(fs.readFileSync(R('data/admin1/index.json')));

const snap = (P) => P.map((r) => r.map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5]));
const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
// area on the sphere of a polygon in clipper winding (outer rings anticlockwise), km²
const km2 = (P) => {
  const a = geoArea({ type: 'Polygon', coordinates: P.map((r) => r.slice().reverse()) });
  return Math.min(a, 4 * Math.PI - a) * R2;
};
const bboxOf = (P) => {
  let b = [1e9, 1e9, -1e9, -1e9];
  for (const p of P) for (const [x, y] of p[0]) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
  return b;
};
const meets = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/**
 * d3 reads a polygon wound the "wrong" way as the whole globe except it; publishers differ (ArcGIS winds outer rings
 * clockwise, RFC 7946 anticlockwise, the clipper anticlockwise), so orient each polygon by its area on the sphere.
 */
// ring by ring: the outer ring encloses the small side, each hole the large side (its outside), as d3 expects;
// sources do not always wind holes opposite to their outer ring (a Census district in Illinois)
const ringBig = (r) => geoArea({ type: 'Polygon', coordinates: [r] }) > 2 * Math.PI;
const d3wind = (Q) => Q.map((r, i) => (ringBig(r) === (i > 0) ? r : r.slice().reverse()));
/** Fit one unit to its country: [polygons in d3 winding, km² dropped outside the country]. */
function fit(P, C) {
  const near = C.list.filter((c) => meets(c.b, bboxOf(P))).map((c) => c.P);
  const out = near.length ? pc.difference(P, ...near) : P;
  const outside = out.reduce((s, Q) => s + km2(Q), 0);
  // wholly inside (up to rounding): keep the publisher's shape untouched, so shared borders stay identical, but drop
  // degenerate slivers (a 4-point piece of an Illinois district has no area, which d3 would draw as the whole globe)
  if (outside < 0.01) return [P.filter((Q) => km2(Q) >= 0.01).map(d3wind), 0];
  const kept = pc.intersection(P, near).filter((Q) => km2(Q) >= MIN_KM2);
  return [kept.map(d3wind), outside];
}

// ---- names, codes and groupings
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s\-'(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
/**
 * A unit's name from a part's fields: name is a field, or a template of fields ("{STATEFP} {CD119FP}"); then
 * case:'title', strip (a regex removed, e.g. " Council$") and replace ([[regex, replacement], ...] in order).
 */
function nameOf(F, p) {
  let n = F.name.includes('{') ? F.name.replace(/\{(\w+)\}/g, (m, k) => String(p[k] ?? '')) : String(p[F.name] || '');
  n = n.trim();
  if (F.case === 'title') n = titleCase(n);
  if (F.strip) n = n.replace(new RegExp(F.strip), '').trim();
  for (const [re, to] of F.replace || []) n = n.replace(new RegExp(re), to);
  return n;
}
/** A part's filter: {field, in: [values]} keeps those, {field, notIn: [values]} drops them. */
const keep = (filter, p) => !filter || (filter.in ? filter.in.includes(String(p[filter.field])) : !filter.notIn.includes(String(p[filter.field])));
/** A part's lookups replace field values before anything else: {STATEFP: {"06": "California"}}. */
function applyLookup(lookup, p) {
  const o = { ...p };
  for (const [k, map] of Object.entries(lookup || {})) if (Object.prototype.hasOwnProperty.call(map, String(o[k]))) o[k] = map[String(o[k])];
  return o;
}
const slug = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
/** code: a field, or "@slug" for data that has only names (historic counties). */
const codeOf = (F, p, name) => (F.code === '@slug' ? slug(name) : String(p[F.code] || '').trim());

// Natural Earth's admin-1 units of a country, for groupings taken from where a unit lies ("from": "ne-admin1")
const neUnits = new Map();
function neAdmin1(country) {
  if (!neUnits.has(country)) {
    const info = a1[country],
      t = info && JSON.parse(fs.readFileSync(R('data/admin1/' + info.f)));
    neUnits.set(country, t ? tj.feature(t, t.objects.u).features : []);
  }
  return neUnits.get(country);
}
// a point inside a unit: the centroid of its largest polygon, or that polygon's first vertex if the centroid falls outside
function insidePoint(polys) {
  const big = polys.reduce((a, P) => (km2(P) > km2(a) ? P : a), polys[0]),
    g = { type: 'Polygon', coordinates: big },
    c = geoCentroid(g);
  return geoContains(g, c) ? c : big[0][0];
}
function groupValue(spec, p, code, polys, country) {
  if (spec.from === 'code') {
    for (const [k, v] of Object.entries(spec.prefix)) if (code.startsWith(k)) return v;
    return '';
  }
  if (spec.from === 'ne-admin1') {
    const pt = insidePoint(polys),
      U = neAdmin1(country);
    const f = U.find((u) => geoContains(u, pt)) || U.reduce((a, u) => (!a || geoDistance(geoCentroid(u), pt) < geoDistance(geoCentroid(a), pt) ? u : a), null);
    return f ? f.properties[spec.field] || '' : '';
  }
  return spec.case === 'title' ? titleCase(String(p[spec.field] || '').trim()) : String(p[spec.field] || '').trim();
}

/**
 * Units of a layer must not overlap, or a click could mean either. Where a publisher's unit lies (almost) wholly
 * inside another (Tailte Éireann's generalised Cork County covers Cork City), it is cut out of the larger one; any
 * other overlap stops the build for a person to look at.
 */
function resolveOverlaps(id, feats) {
  const box = (f) => bboxOf(f.geometry.coordinates),
    area = (f) => f.geometry.coordinates.reduce((s, Q) => s + km2(Q), 0);
  for (let i = 0; i < feats.length; i++)
    for (let j = i + 1; j < feats.length; j++) {
      const a = feats[i],
        b = feats[j],
        A = box(a),
        B = box(b);
      if (!meets(A, B)) continue;
      const over = pc.intersection(a.geometry.coordinates, b.geometry.coordinates).reduce((s, Q) => s + km2(Q), 0);
      if (over < 0.5) continue;
      const [small, big] = area(a) < area(b) ? [a, b] : [b, a];
      if (over < 0.9 * area(small)) throw new Error(id + ': ' + a.properties.n + ' and ' + b.properties.n + ' overlap by ' + over.toFixed(1) + ' km²');
      big.geometry.coordinates = pc.difference(big.geometry.coordinates, small.geometry.coordinates).filter((Q) => km2(Q) >= MIN_KM2).map(d3wind);
      console.log(id + ': ' + small.properties.n + ' lies inside ' + big.properties.n + ' in the source (' + over.toFixed(0) + ' km²); cut out of it');
    }
}

/**
 * Read one part's features, merged by name (`dissolve`: the publisher splits a unit into pieces) and simplified
 * (`simplify`, mapshaper's options, e.g. "interval=150" metres) where the source asks.
 */
async function readPart(file, F, simplify, filter) {
  let buf = fs.readFileSync(file);
  if (file.endsWith('.gz')) buf = zlib.gunzipSync(buf);
  if (filter) {
    const j = JSON.parse(buf);
    j.features = j.features.filter((f) => keep(filter, f.properties));
    buf = Buffer.from(JSON.stringify(j));
  }
  if (!F.dissolve && !simplify) return JSON.parse(buf).features;
  const ms = require('mapshaper'),
    cmd = ['-i in.json'];
  if (F.dissolve) cmd.push('-dissolve "' + F.name + '" copy-fields="' + [F.code, ...Object.values(F.groups || {}).map((g) => g.field)].filter((x) => x && x[0] !== '@').join(',') + '"');
  // no -clean: it resolves overlaps by emptying shapes (it dropped Cork City)
  if (simplify) cmd.push('-simplify ' + simplify + ' keep-shapes');
  cmd.push('-o format=geojson precision=0.000001 out.json');
  const out = await ms.applyCommands(cmd.join(' '), { 'in.json': buf });
  return JSON.parse(out['out.json']).features;
}

/**
 * Quantise to about 1e-4 degrees (11 m, well inside the sources' accuracy) whatever the layer's extent: a fixed 1e5
 * steps across the US (whose Aleutians reach past 180°, so nearly 360° wide) would be 0.0036° and move Alaska's fjord
 * coasts off the land.
 */
function quantFor(polys) {
  let x0 = 1e9,
    x1 = -1e9,
    y0 = 1e9,
    y1 = -1e9;
  for (const Q of polys)
    for (const [x, y] of Q[0]) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  return Math.max(1e5, Math.ceil(Math.max(x1 - x0, y1 - y0) / 1e-4));
}

/** Write a layer's TopoJSON and its entry in the index; returns its size in KB. */
function writeLayer(index, e, topo, n, gr, extra) {
  const country = e.country,
    file = a1[country] ? a1[country].f : country.replace(/[^A-Za-z]/g, '') + '.json',
    out = JSON.stringify(topo);
  fs.mkdirSync(R('data/layers/' + e.id), { recursive: true });
  fs.writeFileSync(R('data/layers/' + e.id + '/' + file), out);
  index[country] = (index[country] || []).filter((x) => x.id !== e.id);
  index[country].push({ id: e.id, name: e.menu, unit: e.unit, ed: e.edition.split(';')[0], f: e.id + '/' + file, n, gr, title: e.title, credit: e.credit, short: e.short, url: e.url, note: e.note || '', order: e.order ?? 50, ...extra });
  index[country].sort((a, b) => a.order - b.order);
  return (out.length / 1024).toFixed(0);
}

// ---- dated layers: units valid from one day to another (the Atlas of Historical County Boundaries' states)
/** Dates are yyyymmdd numbers, as the Atlas stores them; the day after one. */
function nextDay(n) {
  const t = new Date(Date.UTC(Math.floor(n / 1e4), (Math.floor(n / 100) % 100) - 1, (n % 100) + 1));
  return t.getUTCFullYear() * 1e4 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate();
}
const dayBefore = (n) => {
  const t = new Date(Date.UTC(Math.floor(n / 1e4), (Math.floor(n / 100) % 100) - 1, (n % 100) - 1));
  return t.getUTCFullYear() * 1e4 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate();
};
// width of a piece in km (twice its area over its perimeter): a 1 km strip along a border is a mismatch between two
// surveys of the same line, a block of land is a claim
const widthKm = (P) => (2 * km2(P)) / (P.reduce((s, r) => s + geoLength({ type: 'LineString', coordinates: r }), 0) * 6371);
const BEYOND_KM = 5;

/**
 * A dated layer. The source holds every version of every unit, each with the day it began and the day it ended,
 * overlapping wherever two jurisdictions claimed the same land and wherever a unit was replaced. mapshaper's mosaic
 * cuts them into faces that do not overlap, each knowing which versions cover it; then for every span of days between
 * two changes each face gets one label: the version covering it, a disputed area where several do, or "outside" where
 * none does but the land is part of the country by the source's last day. Runs of the same label over the same faces
 * become the layer's units (n, c, ty, d0, d1, and x the source's note on the change), merged from the faces' shared
 * arcs so a border used by many versions is stored once.
 *
 * Faces are fitted to the country, as other layers are, except pieces in the countries named in `beyond` that are
 * wider than BEYOND_KM: claims past today's border (Oregon Country), kept, rather than strips along a border.
 */
async function buildDated(index, e, C) {
  const D = e.dated,
    part = partsOf(e)[0],
    F = part.fields,
    src = R('data/src/' + part.download.file);
  if (!fs.existsSync(src)) throw new Error(e.id + ': ' + src + ' is missing; run node scripts/fetch_sources.js');
  // the versions, simplified together so shared borders stay shared, then cut into faces
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(src)));
  j.features = j.features.filter((f) => keep(part.filter, f.properties));
  const V = j.features.map((f, i) => {
    const p = f.properties,
      name = nameOf(F, p);
    f.properties = { vi: i };
    return { name, code: codeOf(F, p, name), d0: +p[D.start], d1: +p[D.end], ty: String(p[D.type] || ''), x: String(p[D.change] || '').trim() };
  });
  for (const v of V) if (!v.code || !v.name || !(v.d0 <= v.d1)) throw new Error(e.id + ': a version has no code, name or dates: ' + JSON.stringify(v));
  const ms = require('mapshaper'),
    res = await ms.applyCommands('-i in.json -simplify ' + e.simplify + ' keep-shapes -mosaic calc="vs=collect(vi)" -o format=geojson precision=0.000001 out.json', { 'in.json': Buffer.from(JSON.stringify(j)) });
  const mosaic = JSON.parse(res['out.json']).features.filter((f) => f.geometry);

  // fit each face: its part in the country, and its claims beyond it
  const B = { list: (D.beyond || []).flatMap((n) => countryPolys.get(n) || []).map((P) => ({ P: snap(P), b: bboxOf([P]) })) };
  const faces = [];
  let beyondKm2 = 0,
    stripsKm2 = 0;
  for (const f of mosaic) {
    const P = polysOf(f.geometry).map(snap),
      box = bboxOf(P),
      nearC = C.list.filter((c) => meets(c.b, box)).map((c) => c.P),
      nearB = B.list.filter((c) => meets(c.b, box)).map((c) => c.P);
    // small pieces are kept inside the country: dropping one would leave a pinhole in every unit around it
    const inC = nearC.length ? pc.intersection(P, nearC).filter((Q) => km2(Q) >= 0.01) : [];
    let out = [];
    if (nearB.length) {
      const rest = nearC.length ? pc.difference(P, ...nearC) : P;
      for (const Q of rest.length ? pc.intersection(rest, nearB) : []) {
        if (km2(Q) < MIN_KM2) continue;
        if (widthKm(Q) >= BEYOND_KM) out.push(Q), (beyondKm2 += km2(Q));
        else stripsKm2 += km2(Q);
      }
    }
    // the mosaic also fills gaps no version covers; those are not part of any unit
    const vs = [...new Set([].concat(f.properties.vs))].filter(Number.isInteger).sort((a, b) => a - b);
    if (vs.length && (inC.length || out.length)) faces.push({ vs, inC: inC.map(d3wind), out: out.map(d3wind) });
  }

  // the spans of days between changes, and each face's label in each span
  const last = Math.max(...V.map((v) => v.d1)),
    cuts = [...new Set(V.flatMap((v) => [v.d0, nextDay(v.d1)]))].filter((d) => d <= last).sort((a, b) => a - b);
  const covers = (v, d) => V[v].d0 <= d && d <= V[v].d1;
  const atLast = faces.map((fc) => fc.vs.some((v) => covers(v, last)));
  const units = [],
    open = new Map(); // label -> its unit in the span before, to extend while the same faces carry it
  for (let k = 0; k < cuts.length; k++) {
    const d0 = cuts[k],
      d1 = k + 1 < cuts.length ? dayBefore(cuts[k + 1]) : last,
      groups = new Map();
    faces.forEach((fc, i) => {
      const on = fc.vs.filter((v) => covers(v, d0));
      const label = on.length ? on.join('+') : atLast[i] && fc.inC.length ? 'outside' : null;
      if (!label) return;
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(i);
    });
    const still = new Map();
    for (const [label, fs_] of groups) {
      const key = fs_.join(','),
        u = open.get(label);
      if (u && u.key === key && u.d1 === dayBefore(d0)) u.d1 = d1;
      else units.push({ label, key, faces: fs_, d0, d1 });
      still.set(label, u && u.key === key ? u : units[units.length - 1]);
    }
    open.clear();
    for (const [l, u] of still) open.set(l, u);
  }

  // each unit is the union of its faces (only their part in the country for "outside"); the faces share exact
  // coordinates, so the topology stores a border used by many units once
  const tyName = (t) => (t === 'Other' ? e.unit : t);
  const out = units.map((u, id) => {
    const P = u.faces.flatMap((i) => (u.label === 'outside' ? faces[i].inC : [...faces[i].inC, ...faces[i].out]));
    // "outside" keeps only real areas, not specks where two versions of the same coast differ by a few metres
    const min = u.label === 'outside' ? MIN_KM2 : 0.01,
      coordinates = pc.union(...P.map((Q) => [Q])).filter((Q) => km2(Q) >= min).map(d3wind);
    if (!coordinates.length) return null;
    let props;
    if (u.label === 'outside') props = { n: D.outside, c: 'outside', ty: 'Not part of the country on this date' };
    else {
      const vs = u.label.split('+').map(Number);
      if (vs.length === 1) {
        const v = V[vs[0]];
        props = { n: v.name, c: v.code, ty: tyName(v.ty), x: v.x };
      } else {
        const names = vs.map((v) => V[v].name),
          codes = vs.map((v) => V[v].code).sort();
        props = { n: names.join(' / ') + ' (disputed)', c: 'dsp.' + codes.join('.'), ty: 'Disputed area' };
      }
    }
    return { type: 'Feature', id, geometry: { type: 'MultiPolygon', coordinates }, properties: { ...props, d0: u.d0, d1: u.d1, r: '', g: '' } };
  });
  // a unit made only of specks is gone; renumber the rest
  for (const [i, f] of out.entries()) if (!f && units[i].label !== 'outside') throw new Error(e.id + ': unit ' + units[i].label + ' lost its shape');
  const kept = out.map((f, i) => [f, units[i]]).filter(([f]) => f);
  out.length = 0;
  units.length = 0;
  for (const [f, u] of kept) (f.id = out.length), out.push(f), units.push(u);
  const topo = ts.topology({ u: { type: 'FeatureCollection', features: out } }, quantFor(out.flatMap((f) => f.geometry.coordinates)));
  const kb = writeLayer(index, e, topo, out.length, {}, { dated: { from: Math.min(...V.map((v) => v.d0)), to: last, stops: D.stops || [], outside: D.outside } });

  // what a person checking the build needs: totals, the disputed areas, the units at each stop
  const area = (u) => u.faces.reduce((s, i) => s + [...faces[i].inC, ...(u.label === 'outside' ? [] : faces[i].out)].reduce((t, Q) => t + km2(Q), 0), 0);
  console.log(e.id + ': ' + V.length + ' versions, ' + faces.length + ' faces, ' + cuts.length + ' spans of days, ' + out.length + ' units, ' + kb + ' KB; ' + Math.round(beyondKm2) + ' km² of claims beyond ' + e.country + ' kept, ' + Math.round(stripsKm2) + ' km² of border strips dropped');
  for (const [i, u] of units.entries()) if (out[i].properties.ty === 'Disputed area') console.log('  disputed ' + u.d0 + '..' + u.d1 + ': ' + out[i].properties.n + ', ' + Math.round(area(u)) + ' km²');
  for (const s of D.stops || []) {
    const on = units.filter((u) => u.d0 <= s && s <= u.d1);
    console.log('  ' + s + ': ' + on.length + ' units (' + on.filter((u) => u.label === 'outside').reduce((t, u) => t + Math.round(area(u)), 0) + ' km² outside)');
  }
}

/**
 * A dated layer made of snapshots (`dated.snapshots`): each unit belongs to one map of the whole country (a census),
 * shown for the days d0 to d1 of that map, and no two maps overlap in time. So there is nothing to cut into faces:
 * every unit is fitted to the country like in an undated layer, and each map but the last also gets an "outside"
 * unit, the land that the last map covers and this one does not. As in buildDated, a strip along a border or coast
 * narrower than BEYOND_KM is a mismatch between two simplified maps, not land outside the country, and is dropped.
 */
async function buildSnapshots(index, e, C) {
  const D = e.dated,
    part = partsOf(e)[0],
    F = part.fields,
    src = R('data/src/' + part.download.file);
  if (!fs.existsSync(src)) throw new Error(e.id + ': ' + src + ' is missing; run node scripts/fetch_sources.js');
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(src))),
    maps = new Map();
  for (const f of j.features.filter((f) => keep(part.filter, f.properties))) {
    const p = f.properties,
      name = nameOf(F, p),
      code = codeOf(F, p, name),
      d0 = +p[D.start],
      d1 = +p[D.end];
    if (!code || !name || !(d0 <= d1)) throw new Error(e.id + ': a unit has no code, name or dates: ' + JSON.stringify(p));
    const raw = polysOf(f.geometry).map(snap),
      [polys] = fit(raw, C);
    if (!polys.length) {
      console.warn(e.id + ': ' + name + ' (' + d0 + ') lies outside ' + e.country + ' on the map and is left out');
      continue;
    }
    if (!maps.has(d0)) maps.set(d0, { d0, d1, basis: String(p[D.basis] || ''), units: [], codes: new Set() });
    const m = maps.get(d0);
    if (m.d1 !== d1) throw new Error(e.id + ': units of the map from ' + d0 + ' disagree on its last day');
    if (m.codes.has(code)) throw new Error(e.id + ': duplicate code ' + code + ' in the map from ' + d0);
    m.codes.add(code);
    m.units.push({ name, code, ty: String(p[D.type] || '') || e.unit, x: String(p[D.change] || '').trim(), polys, raw });
  }
  const order = [...maps.values()].sort((a, b) => a.d0 - b.d0);
  for (const [i, m] of order.entries()) if (i && m.d0 !== nextDay(order[i - 1].d1)) throw new Error(e.id + ': the map from ' + m.d0 + ' does not follow the one before it');
  // unions are taken of the publisher's own shapes, whose shared borders are exact; the units fitted to the coast one
  // by one no longer match each other to the last digit, which the clipper cannot always resolve
  const union = (m) => pc.union(...m.units.flatMap((u) => u.raw).map((Q) => [Q])),
    last = order[order.length - 1],
    // a map is compared with the last map drawn on the same basis (`dated.basis`): maps of one basis share a coast,
    // while another basis may include coastal water the first leaves out, which would read as land not yet in the country
    ref = (m) => [...order].reverse().find((o) => o.basis === m.basis),
    refUnion = new Map();
  for (const m of order) if (!refUnion.has(ref(m))) refUnion.set(ref(m), union(ref(m)));

  const out = [];
  const outsideKm2 = [];
  for (const m of order) {
    for (const u of m.units) out.push({ type: 'Feature', id: out.length, geometry: { type: 'MultiPolygon', coordinates: u.polys }, properties: { n: u.name, c: u.code, ty: u.ty, x: u.x, d0: m.d0, d1: m.d1, r: '', g: '' } });
    if (m === ref(m)) continue;
    const notYet = pc.difference(refUnion.get(ref(m)), union(m)),
      gone = (notYet.length ? fit(notYet, C)[0] : []).filter((Q) => km2(Q) >= MIN_KM2 && widthKm(Q) >= BEYOND_KM);
    outsideKm2.push(Math.round(gone.reduce((s, Q) => s + km2(Q), 0)));
    if (gone.length) out.push({ type: 'Feature', id: out.length, geometry: { type: 'MultiPolygon', coordinates: gone }, properties: { n: D.outside, c: 'outside', ty: 'Not part of the country on this date', d0: m.d0, d1: m.d1, r: '', g: '' } });
  }
  const topo = ts.topology({ u: { type: 'FeatureCollection', features: out } }, quantFor(out.flatMap((f) => f.geometry.coordinates))),
    kb = writeLayer(index, e, topo, out.length, {}, { dated: { from: order[0].d0, to: last.d1, stops: D.stops || [], outside: D.outside } });
  // a layer's own metadata file (scripts/sources/<id>.metadata.xml) goes out with its data
  const meta = R('scripts/sources/' + e.id + '.metadata.xml');
  if (fs.existsSync(meta)) fs.copyFileSync(meta, R('data/layers/' + e.id + '/metadata.xml'));
  console.log(e.id + ': ' + order.length + ' maps, ' + out.length + ' units, ' + kb + ' KB');
  let k = 0;
  for (const m of order) console.log('  ' + m.d0 + '..' + m.d1 + ': ' + m.units.length + ' units' + (m === ref(m) ? '' : ', ' + outsideKm2[k++] + ' km² outside'));
}

(async () => {
const only = process.argv.slice(2);
const indexFile = R('data/layers/index.json');
const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile)) : {};
for (const e of layers()) {
  if (only.length && !only.includes(e.id)) continue;
  const country = e.country,
    C0 = countryPolys.get(country);
  if (!C0) throw new Error(e.id + ': no country "' + country + '" on the map');
  const C = { list: C0.map((P) => ({ P: snap(P), b: bboxOf([P]) })) };
  if (e.dated) {
    await (e.dated.snapshots ? buildSnapshots : buildDated)(index, e, C);
    continue;
  }
  const countryKm2 = C0.reduce((s, P) => s + km2(P.map((r) => r.slice().reverse())), 0);
  const codes = new Set(),
    feats = [];
  let dropped = 0,
    cut = 0,
    covered = 0;
  for (const part of partsOf(e)) {
    const src = R('data/src/' + part.download.file),
      F = part.fields;
    if (!fs.existsSync(src)) throw new Error(e.id + ': ' + src + ' is missing; run node scripts/fetch_sources.js');
    for (const f of await readPart(src, F, e.simplify, part.filter)) {
      // a unit must never vanish quietly
      if (!f.geometry) throw new Error(e.id + ': ' + (f.properties[F.name] || 'a unit') + ' has no shape after reading');
      const p = applyLookup(part.lookup, f.properties),
        name = nameOf(F, p),
        code = codeOf(F, p, name);
      if (!code || !name) throw new Error(e.id + ': a feature has no code or name');
      if (codes.has(code)) throw new Error(e.id + ': duplicate code ' + code + ' (' + name + ')');
      codes.add(code);
      const [polys, out] = fit(polysOf(f.geometry).map(snap), C);
      if (out) cut++;
      dropped += out;
      if (!polys.length) {
        console.warn(e.id + ': ' + name + ' lies outside ' + country + ' on the map and is left out');
        continue;
      }
      covered += polys.reduce((s, Q) => s + km2(Q), 0);
      const props = { n: name, c: code, ty: e.unit, r: '', g: '' };
      for (const [k, spec] of Object.entries(F.groups || {})) props[k] = groupValue(spec, p, code, polys, country);
      // seats: a regex whose first group is the unit's number of seats, read from the name field before strip
      if (F.seats) {
        const m = new RegExp(F.seats).exec(String(p[F.name] || ''));
        if (!m || !(+m[1] > 0)) throw new Error(e.id + ': ' + name + ' has no seat count in "' + p[F.name] + '"');
        props.s = +m[1];
      }
      feats.push({ type: 'Feature', id: feats.length, geometry: { type: 'MultiPolygon', coordinates: polys }, properties: props });
    }
  }
  resolveOverlaps(e.id, feats);
  const topo = ts.topology({ u: { type: 'FeatureCollection', features: feats } }, quantFor(feats.flatMap((f) => f.geometry.coordinates))),
    // groupings worth offering: a field with 2+ values that groups several units
    gr = {};
  for (const k of ['g', 'r']) {
    const vals = new Set(feats.map((f) => f.properties[k]).filter(Boolean));
    if (vals.size > 1 && vals.size < feats.length) gr[k] = vals.size;
  }
  const kb = writeLayer(index, e, topo, feats.length, gr, {});
  console.log(
    e.id + ': ' + feats.length + ' units, ' + kb + ' KB; ' + cut + ' cut back to the coast (' + Math.round(dropped) + ' km² outside ' + country + ' dropped); units cover ' + ((100 * covered) / countryKm2).toFixed(1) + '% of it' + (feats[0] && feats[0].properties.s ? '; ' + feats.reduce((t, f) => t + f.properties.s, 0) + ' seats' : ''),
  );
}
fs.mkdirSync(R('data/layers'), { recursive: true });
fs.writeFileSync(indexFile, JSON.stringify(index));
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
