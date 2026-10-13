// Loads the base data (countries topology, fill mesh, lakes and rivers) and builds lookups.
import { feature } from 'topojson-client';
import { geoArea, geoCentroid } from 'd3-geo';
import { inflate, decodeTris, decodePhys } from './decode.js';

// Natural Earth splits these out; we merge them into the country that contains them.
export const ALIAS = { Baikonur: 'Kazakhstan', 'USNB Guantanamo Bay': 'Cuba' };

export const geo = {
  topo: null,
  feats: [], // country features (1-based id = index + 1)
  nameId: new Map(), // name -> id of its first feature (aliases share one id)
  names: [], // sorted unique names
  labelPts: [], // [{n, a, c}] largest part's area and centroid, for country name labels
  polys: [], // unwrapped polygons with bounding boxes, for exact picking
  a1index: {}, // country name -> subdivision file info
};

async function fetchOk(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('could not load ' + url + ' (HTTP ' + r.status + ')');
  return r;
}
export const fetchBin = async (url) => inflate(await (await fetchOk(url)).arrayBuffer());
export const fetchJSON = async (url) => (await fetchOk(url)).json();

/**
 * Fetch what the first frame needs (countries, fill mesh, subdivision index) in parallel.
 * Lakes and rivers come back as a separate promise so they can arrive after the globe is shown.
 */
export async function loadBase() {
  if (typeof DecompressionStream === 'undefined') throw new Error('this browser is too old (no DecompressionStream)');
  const phys = fetchBin('data/phys.bin').then(decodePhys);
  phys.catch(() => {}); // handled by the caller; avoid an unhandled-rejection warning meanwhile
  const [topo, tris, a1] = await Promise.all([fetchJSON('data/countries.json'), fetchBin('data/tris.bin'), fetchJSON('admin1/index.json')]);
  indexCountries(topo);
  geo.a1index = a1;
  return { tris: decodeTris(tris), phys };
}

function indexCountries(topo) {
  geo.topo = topo;
  geo.feats = feature(topo, topo.objects.countries).features.filter((f) => f.properties && f.properties.name);
  geo.feats.forEach((f) => {
    const a = ALIAS[f.properties.name];
    if (a) f.properties.name = a;
  });
  geo.feats.forEach((f, i) => {
    if (!geo.nameId.has(f.properties.name)) geo.nameId.set(f.properties.name, i + 1);
  });
  geo.names = [...geo.nameId.keys()].sort();
  geo.labelPts = geo.feats
    .map((f) => {
      const g = f.geometry;
      let poly = g.type === 'Polygon' ? g.coordinates : null,
        a = 0;
      if (poly) a = geoArea({ type: 'Polygon', coordinates: poly });
      else
        g.coordinates.forEach((p) => {
          const x = geoArea({ type: 'Polygon', coordinates: p });
          if (x > a) {
            a = x;
            poly = p;
          }
        });
      return { n: f.properties.name, a, c: geoCentroid({ type: 'Polygon', coordinates: poly }) };
    })
    .sort((x, y) => y.a - x.a);
  geo.polys = [];
  geo.feats.forEach((f) => {
    const g = f.geometry;
    (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).forEach((rp) => {
      const poly = unwrapPoly(rp);
      let x0 = 1e9,
        y0 = 1e9,
        x1 = -1e9,
        y1 = -1e9;
      for (const k of poly[0]) {
        x0 = Math.min(x0, k[0]);
        x1 = Math.max(x1, k[0]);
        y0 = Math.min(y0, k[1]);
        y1 = Math.max(y1, k[1]);
      }
      geo.polys.push({ id: geo.nameId.get(f.properties.name), bb: [x0, y0, x1, y1], poly });
    });
  });
}

// Rings that cross the antimeridian are unwrapped to continuous longitudes; rings around a pole are closed through it.
export function unwrapRing(ring, ref) {
  const out = [];
  let off = 0,
    prev = ring[0][0];
  for (const p of ring) {
    let x = p[0] + off;
    while (x - prev > 180) {
      off -= 360;
      x -= 360;
    }
    while (prev - x > 180) {
      off += 360;
      x += 360;
    }
    prev = x;
    out.push([x, p[1]]);
  }
  const F = out[0],
    Lp = out[out.length - 1];
  if (Math.abs(Lp[0] - F[0]) > 180) {
    const pole = F[1] + Lp[1] < 0 ? -90 : 90;
    out.push([Lp[0], pole], [F[0], pole]);
  }
  if (ref !== undefined) {
    const d = Math.round((ref - out[0][0]) / 360);
    if (d) for (const p of out) p[0] += 360 * d;
  }
  return out;
}
export function unwrapPoly(poly) {
  const o = unwrapRing(poly[0]);
  return [o].concat(poly.slice(1).map((r) => unwrapRing(r, o[0][0])));
}
function inRing(r, x, y) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i],
      b = r[j];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
/** Country id at a lon/lat (exact point-in-polygon), 0 for sea. */
export function idAtLL(x, y) {
  for (const p of geo.polys) {
    const b = p.bb;
    if (y < b[1] || y > b[3]) continue;
    let xx = x;
    if (xx < b[0] && xx + 360 <= b[2]) xx += 360;
    else if (xx > b[2] && xx - 360 >= b[0]) xx -= 360;
    if (xx < b[0] || xx > b[2] || !inRing(p.poly[0], xx, y)) continue;
    let hole = false;
    for (let k = 1; k < p.poly.length; k++)
      if (inRing(p.poly[k], xx, y)) {
        hole = true;
        break;
      }
    if (!hole) return p.id;
  }
  return 0;
}
export const nameOf = (id) => geo.feats[id - 1].properties.name;
