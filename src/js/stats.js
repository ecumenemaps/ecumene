// Statistics to color the map with (pure, unit tested): the World Bank's country indicators, fetched in the browser
// when one is chosen, and the US electoral votes per state. The list of indicators, with licence and credit, is in
// scripts/sources/stat-worldbank.json; matching to countries uses ISO 3166-1 alpha-3 codes (src/iso.js).
import ISO from '../iso.js';

export const WB_API = 'https://api.worldbank.org/v2/country/all/indicator/';
/** How many years back the fetch looks. */
export const WINDOW = 15;
/** A year has good coverage when it has at least this share of the countries the best year has. */
export const GOOD = 0.9;
/** The paint of countries without data (a grey ground with fine dots; patterns.js), and its legend label. */
export const NO_DATA_PAINT = 'p:fine:#dcdcdc:#8c8c8c';
export const NO_DATA_LABEL = 'No data';

/** The URL of one indicator for every country and a run of years ending in thisYear. */
export const wbURL = (code, thisYear) =>
  WB_API + encodeURIComponent(code) + '?format=json&per_page=20000&date=' + (thisYear - WINDOW) + ':' + thisYear;

/** Round to 7 significant digits, more than any of these series can claim, so saved maps stay small. */
const round = (x) => +x.toPrecision(7);

/**
 * Read the World Bank's JSON ([paging info, rows]). Rows for regions and income groups (World, Euro area...) are
 * dropped: only codes of countries on the map are kept. Returns {year: {ISO3: value}} (years as numbers), or throws
 * a readable error when the reply is not a list of rows.
 */
export function parseWB(json) {
  if (!Array.isArray(json)) throw new Error('the World Bank did not return a list of values');
  if (json[0] && json[0].message) throw new Error('the World Bank said: ' + json[0].message.map((m) => m.value).join(' '));
  const rows = json[1];
  if (!Array.isArray(rows)) throw new Error('the World Bank returned no values for this indicator');
  const out = {};
  for (const r of rows) {
    const code = r && r.countryiso3code,
      y = r && +r.date;
    if (!code || !Number.isInteger(y) || typeof r.value !== 'number' || !Number.isFinite(r.value)) continue;
    if (!ISO.ISO3_ID[code] && !ISO.ISO3_NAME[code]) continue;
    (out[y] = out[y] || {})[code] = round(r.value);
  }
  return out;
}

/** Number of countries with a value in each year: {year: n}. */
export const coverage = (byYear) => Object.fromEntries(Object.entries(byYear).map(([y, v]) => [y, Object.keys(v).length]));

/** The latest year with good coverage (GOOD of the best year's count), or null when there is no data at all. */
export function chooseYear(byYear) {
  const n = coverage(byYear),
    best = Math.max(0, ...Object.values(n));
  if (!best) return null;
  const ok = Object.keys(n)
    .map(Number)
    .filter((y) => n[y] >= GOOD * best);
  return Math.max(...ok);
}

/** The years that have any value, latest first. */
export const yearsWithData = (byYear) =>
  Object.keys(byYear)
    .map(Number)
    .filter((y) => Object.keys(byYear[y]).length)
    .sort((a, b) => b - a);

/**
 * The values to use. year is a number, or 'latest' for each country's most recent value in the window.
 * Returns {v: {ISO3: value}, ys: {ISO3: year}} (ys only for 'latest'), or null if there is nothing.
 */
export function valuesFor(byYear, year) {
  if (year !== 'latest') {
    const v = byYear[year];
    return v && Object.keys(v).length ? { v: { ...v } } : null;
  }
  const v = {},
    ys = {};
  for (const y of yearsWithData(byYear).reverse()) for (const [c, x] of Object.entries(byYear[y])) (v[c] = x), (ys[c] = y);
  return Object.keys(v).length ? { v, ys } : null;
}

/** The record saved with a map: {k:'wb', c: indicator code, y: year or 'latest', t: date fetched, v, ys?}. */
export function wbRecord(code, year, fetched, vals) {
  const r = { k: 'wb', c: code, y: year, t: fetched, v: vals.v };
  if (vals.ys) r.ys = vals.ys;
  return r;
}

/** Years of the values in a record: [first, last]. */
export function yearSpan(rec) {
  if (rec.y !== 'latest') return [rec.y, rec.y];
  const ys = Object.values(rec.ys || {});
  return ys.length ? [Math.min(...ys), Math.max(...ys)] : [0, 0];
}
const yearText = (rec) => {
  if (rec.y !== 'latest') return String(rec.y);
  const [a, b] = yearSpan(rec);
  return 'most recent available' + (a === b ? ', ' + a : ', ' + a + '–' + b);
};

/** Legend title, for example "GDP per capita (current US$), 2023". ind is an entry of stat-worldbank.json. */
export function wbTitle(ind, rec) {
  return ind.title + ', ' + yearText(rec);
}
/** The credit printed with an export, for example "World Bank, World Development Indicators, NY.GDP.PCAP.CD, 2023, CC BY 4.0". */
export function wbCredit(src, ind, rec) {
  const y = rec.y === 'latest' ? 'most recent year per country (' + yearSpan(rec).join('–') + ')' : rec.y;
  return src.credit + ', ' + ind.code + ', ' + y + ', ' + src.licence.name;
}
/** Fuller text for an SVG's metadata. */
export function wbDetails(src, ind, rec) {
  return (
    'Statistic: ' +
    ind.title +
    ', ' +
    yearText(rec) +
    '. ' +
    wbCredit(src, ind, rec) +
    ' (' +
    src.url +
    '). Collected by ' +
    ind.origin +
    '. Fetched from the World Bank on ' +
    rec.t +
    ' and saved with the map. Countries without a value are marked "' +
    NO_DATA_LABEL +
    '".'
  );
}

// ---- matching to the map

let idIso;
/** The ISO alpha-3 code of a map country (a feature of the countries layer), or '' for places without one. */
export function isoOf(feat) {
  if (!idIso) {
    idIso = new Map(Object.entries(ISO.ISO3_ID).map(([iso, id]) => [id, iso]));
    for (const [iso, name] of Object.entries(ISO.ISO3_NAME)) idIso.set('name:' + name, iso);
  }
  if (ISO.ISO_SKIP.includes(feat.properties.name)) return '';
  return (feat.id != null && idIso.get(String(feat.id).padStart(3, '0'))) || idIso.get('name:' + feat.properties.name) || '';
}

/**
 * Which map countries get which value. feats are the countries layer's features (names may repeat where Natural
 * Earth splits one country; they are merged by name). Returns {with: Map name -> {value, year?}, without: [names]}.
 */
export function matchCountries(feats, rec) {
  const withData = new Map(),
    names = new Set();
  for (const f of feats) {
    const n = f.properties.name;
    names.add(n);
    const c = isoOf(f);
    if (c && rec.v[c] !== undefined && !withData.has(n)) withData.set(n, { value: rec.v[c], year: rec.ys ? rec.ys[c] : undefined });
  }
  return { with: withData, without: [...names].filter((n) => !withData.has(n)).sort() };
}

/** Whether a saved record is well formed (maps are untrusted input). */
export function validRecord(r) {
  if (!r || typeof r !== 'object') return null;
  if (r.k === 'ev') return { k: 'ev' };
  if (r.k !== 'wb' || typeof r.c !== 'string' || !/^[A-Za-z0-9._]{3,40}$/.test(r.c)) return null;
  if (!(r.y === 'latest' || (Number.isInteger(r.y) && r.y > 1900 && r.y < 2200))) return null;
  if (typeof r.t !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.t) || !r.v || typeof r.v !== 'object') return null;
  const v = {},
    ys = {};
  for (const [c, x] of Object.entries(r.v)) {
    if (!/^[A-Z]{3}$/.test(c) || typeof x !== 'number' || !Number.isFinite(x)) continue;
    v[c] = x;
    const y = r.ys && r.ys[c];
    if (r.y === 'latest') {
      if (Number.isInteger(y) && y > 1900 && y < 2200) ys[c] = y;
      else delete v[c];
    }
  }
  const out = { k: 'wb', c: r.c, y: r.y, t: r.t, v };
  if (r.y === 'latest') out.ys = ys;
  return out;
}

// ---- US electoral votes

/**
 * Seats in the House of Representatives by state after the 2020 Census (U.S. Census Bureau, 2020 apportionment,
 * public domain). Electors are the seats plus two senators; the District of Columbia has 3 (23rd Amendment). These
 * hold for the 2024, 2028 and 2032 elections.
 */
export const HOUSE_SEATS = {
  Alabama: 7,
  Alaska: 1,
  Arizona: 9,
  Arkansas: 4,
  California: 52,
  Colorado: 8,
  Connecticut: 5,
  Delaware: 1,
  Florida: 28,
  Georgia: 14,
  Hawaii: 2,
  Idaho: 2,
  Illinois: 17,
  Indiana: 9,
  Iowa: 4,
  Kansas: 4,
  Kentucky: 6,
  Louisiana: 6,
  Maine: 2,
  Maryland: 8,
  Massachusetts: 9,
  Michigan: 13,
  Minnesota: 8,
  Mississippi: 4,
  Missouri: 8,
  Montana: 2,
  Nebraska: 3,
  Nevada: 4,
  'New Hampshire': 2,
  'New Jersey': 12,
  'New Mexico': 3,
  'New York': 26,
  'North Carolina': 14,
  'North Dakota': 1,
  Ohio: 15,
  Oklahoma: 5,
  Oregon: 6,
  Pennsylvania: 17,
  'Rhode Island': 2,
  'South Carolina': 7,
  'South Dakota': 1,
  Tennessee: 9,
  Texas: 38,
  Utah: 4,
  Vermont: 1,
  Virginia: 11,
  Washington: 10,
  'West Virginia': 2,
  Wisconsin: 8,
  Wyoming: 1,
};
/** Electoral votes by state name, including the District of Columbia. */
export const ELECTORAL_VOTES = Object.assign(Object.fromEntries(Object.entries(HOUSE_SEATS).map(([s, n]) => [s, n + 2])), {
  'District of Columbia': 3,
});
/** The state a Natural Earth US admin-1 unit stands for (its properties: n name, ty type), or '' for any other unit. */
export const electoralName = (p) => (p.ty === 'Federal District' ? 'District of Columbia' : p.ty === 'State' ? p.n : '');
export const ELECTORAL_TITLE = 'Electoral votes per state, 2024, 2028 and 2032 elections';
