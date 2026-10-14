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
  { geoArea } = require('d3-geo');
const { layers } = require('./lib/sources.js');
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

function groupValue(spec, props, code) {
  if (spec.from === 'code') {
    for (const [k, v] of Object.entries(spec.prefix)) if (code.startsWith(k)) return v;
    return '';
  }
  return String(props[spec.field] || '').trim();
}

const only = process.argv.slice(2);
const indexFile = R('data/layers/index.json');
const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile)) : {};
for (const e of layers()) {
  if (only.length && !only.includes(e.id)) continue;
  const src = R('data/src/' + e.download.file);
  if (!fs.existsSync(src)) throw new Error(e.id + ': ' + src + ' is missing; run node scripts/fetch_sources.js');
  const raw = JSON.parse(fs.readFileSync(src));
  const country = e.country,
    C0 = countryPolys.get(country);
  if (!C0) throw new Error(e.id + ': no country "' + country + '" on the map');
  const C = { list: C0.map((P) => ({ P: snap(P), b: bboxOf([P]) })) };
  const countryKm2 = C0.reduce((s, P) => s + km2(P.map((r) => r.slice().reverse())), 0);
  const F = e.fields,
    codes = new Set(),
    feats = [];
  let dropped = 0,
    cut = 0,
    covered = 0;
  raw.features.forEach((f) => {
    const p = f.properties,
      code = String(p[F.code] || '').trim(),
      name = String(p[F.name] || '').trim();
    if (!code || !name) throw new Error(e.id + ': a feature has no code or name');
    if (codes.has(code)) throw new Error(e.id + ': duplicate code ' + code);
    codes.add(code);
    const [polys, out] = fit(polysOf(f.geometry).map(snap), C);
    if (out) cut++;
    dropped += out;
    if (!polys.length) {
      console.warn(e.id + ': ' + name + ' lies outside ' + country + ' on the map and is left out');
      return;
    }
    covered += polys.reduce((s, Q) => s + km2(Q), 0);
    const props = { n: name, c: code, ty: e.unit, r: '', g: '' };
    for (const [k, spec] of Object.entries(F.groups || {})) props[k] = groupValue(spec, p, code);
    feats.push({ type: 'Feature', id: feats.length, geometry: { type: 'MultiPolygon', coordinates: polys }, properties: props });
  });
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
  index[country].push({ id: e.id, name: e.menu, unit: e.unit, ed: e.edition.split(';')[0], f: e.id + '/' + file, n: feats.length, gr, title: e.title, credit: e.credit, short: e.short, url: e.url, order: e.order ?? 50 });
  index[country].sort((a, b) => a.order - b.order);
  console.log(
    e.id + ': ' + feats.length + ' units, ' + (out.length / 1024).toFixed(0) + ' KB; ' + cut + ' cut back to the coast (' + Math.round(dropped) + ' km² outside ' + country + ' dropped); units cover ' + ((100 * covered) / countryKm2).toFixed(1) + '% of it',
  );
}
fs.mkdirSync(R('data/layers'), { recursive: true });
fs.writeFileSync(indexFile, JSON.stringify(index));
