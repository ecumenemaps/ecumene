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
  { geoArea, geoCentroid, geoContains, geoDistance } = require('d3-geo');
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
const d3wind = (Q) => (geoArea({ type: 'Polygon', coordinates: Q }) > 2 * Math.PI ? Q.map((r) => r.slice().reverse()) : Q);
/** Fit one unit to its country: [polygons in d3 winding, km² dropped outside the country]. */
function fit(P, C) {
  const near = C.list.filter((c) => meets(c.b, bboxOf(P))).map((c) => c.P);
  const out = near.length ? pc.difference(P, ...near) : P;
  const outside = out.reduce((s, Q) => s + km2(Q), 0);
  // wholly inside (up to rounding): keep the publisher's shape untouched, so shared borders stay identical
  if (outside < 0.01) return [P.map(d3wind), 0];
  const kept = pc.intersection(P, near).filter((Q) => km2(Q) >= MIN_KM2);
  return [kept.map(d3wind), outside];
}

// ---- names, codes and groupings
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s\-'(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
/** A unit's name from a part's fields: {name, case:'title', strip: regex removed from the end, e.g. " Council"}. */
function nameOf(F, p) {
  let n = String(p[F.name] || '').trim();
  if (F.case === 'title') n = titleCase(n);
  if (F.strip) n = n.replace(new RegExp(F.strip), '').trim();
  return n;
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
async function readPart(file, F, simplify) {
  let buf = fs.readFileSync(file);
  if (file.endsWith('.gz')) buf = zlib.gunzipSync(buf);
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
    for (const f of await readPart(src, F, e.simplify)) {
      // a unit must never vanish quietly
      if (!f.geometry) throw new Error(e.id + ': ' + (f.properties[F.name] || 'a unit') + ' has no shape after reading');
      const p = f.properties,
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
      feats.push({ type: 'Feature', id: feats.length, geometry: { type: 'MultiPolygon', coordinates: polys }, properties: props });
    }
  }
  resolveOverlaps(e.id, feats);
  const file = (a1[country] ? a1[country].f : country.replace(/[^A-Za-z]/g, '') + '.json'),
    topo = ts.topology({ u: { type: 'FeatureCollection', features: feats } }, 1e5),
    out = JSON.stringify(topo);
  fs.mkdirSync(R('data/layers/' + e.id), { recursive: true });
  fs.writeFileSync(R('data/layers/' + e.id + '/' + file), out);
  // groupings worth offering: a field with 2+ values that groups several units
  const gr = {};
  for (const k of ['g', 'r']) {
    const vals = new Set(feats.map((f) => f.properties[k]).filter(Boolean));
    if (vals.size > 1 && vals.size < feats.length) gr[k] = vals.size;
  }
  index[country] = (index[country] || []).filter((x) => x.id !== e.id);
  index[country].push({ id: e.id, name: e.menu, unit: e.unit, ed: e.edition.split(';')[0], f: e.id + '/' + file, n: feats.length, gr, title: e.title, credit: e.credit, short: e.short, url: e.url, note: e.note || '', order: e.order ?? 50 });
  index[country].sort((a, b) => a.order - b.order);
  console.log(
    e.id + ': ' + feats.length + ' units, ' + (out.length / 1024).toFixed(0) + ' KB; ' + cut + ' cut back to the coast (' + Math.round(dropped) + ' km² outside ' + country + ' dropped); units cover ' + ((100 * covered) / countryKm2).toFixed(1) + '% of it',
  );
}
fs.mkdirSync(R('data/layers'), { recursive: true });
fs.writeFileSync(indexFile, JSON.stringify(index));
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
