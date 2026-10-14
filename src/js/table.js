// Your own data (pure, unit tested): read a table from pasted text, a CSV/TSV/XLSX file or a Google Sheets link, find
// the column of places and the column of values, match places by name or ISO code, and describe where the data came
// from for exports. The Data panel (ui-import.js) uses these; ui-paint.js colours the map.
import ISO from '../iso.js';
import { isoOf } from './stats.js';
import { inflate } from './decode.js';

/** Most rows read from one table; more is cut off (and said so), to keep saved maps and map codes small. */
export const MAX_ROWS = 5000;
const MAX_CELL = 120;

// ---- reading text

const DELIMS = ['\t', ';', ',', '|'];

/** Split one delimited text into rows of cells, honouring double quotes ("a, b" and "" inside quotes). */
function splitDelimited(text, d) {
  const rows = [];
  let row = [],
    cell = '',
    q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"' && cell.trim() === '') {
      cell = '';
      q = true;
    } else if (ch === d) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows.map((r) => r.map((c) => c.trim().slice(0, MAX_CELL))).filter((r) => r.some((c) => c !== ''));
}

/**
 * Read pasted or loaded text as a table: {rows: [[cell, ...]], delim}. The delimiter is the one (tab, semicolon,
 * comma, bar) that gives most lines the same number of cells, at least two. Lines like "Italy: 12%" or "Peru = 3"
 * that use none of them are split at their last separator, as the paste box always allowed.
 */
export function parseText(text) {
  text = String(text || '').replace(/^﻿/, '');
  let best = null;
  for (const d of DELIMS) {
    if (!text.includes(d)) continue;
    const rows = splitDelimited(text, d),
      counts = new Map();
    for (const r of rows) counts.set(r.length, (counts.get(r.length) || 0) + 1);
    const [n, freq] = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0] || [0, 0];
    // a comma inside numbers ("1,234") must not win over a real delimiter
    const score = n >= 2 ? freq / rows.length + (d === ',' ? 0 : 0.001) : 0;
    if (score > 0.5 && (!best || score > best.score)) best = { rows, delim: d, score };
  }
  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (best) {
    // a line the delimiter does not split, such as "Italy: 12%", keeps the old "name: value" reading
    best.rows = best.rows.map((r, i) => (r.length === 1 ? splitLoose(r[0]) : r));
    return { rows: best.rows.slice(0, MAX_ROWS), delim: best.delim, cut: best.rows.length > MAX_ROWS };
  }
  const rows = lines.map(splitLoose);
  return { rows: rows.slice(0, MAX_ROWS), delim: '', cut: rows.length > MAX_ROWS };
}
/** "France, 68", "Italy: 12%", "Peru = 3": a name and a value after the first separator; anything else is one cell. */
function splitLoose(line) {
  const m = /^(.*?)\s*[\t;:,=]\s*([-+−]?\d[\d\s.,]*%?)\s*$/.exec(line);
  return (m ? [m[1], m[2]] : [line]).map((c) => c.replace(/^["']|["']$/g, '').trim().slice(0, MAX_CELL));
}

// ---- numbers, colours and categories

/**
 * A number from a cell: "1,234.5", "1.234,5", "12%", "−3", "3,5" (a decimal comma when it cannot be thousands).
 * NaN when the cell is not a number.
 */
export function parseNumber(s) {
  let v = String(s == null ? '' : s).trim().replace(/[\s  ]/g, '').replace(/^−/, '-').replace(/%$/, '');
  if (!/^[-+]?(\d[\d.,]*|[.,]\d+)$/.test(v)) return NaN;
  if (/,/.test(v) && /\./.test(v)) v = v.lastIndexOf(',') > v.lastIndexOf('.') ? v.replace(/\./g, '').replace(',', '.') : v.replace(/,/g, '');
  else if (/^[-+]?\d{1,3}(,\d{3})+$/.test(v)) v = v.replace(/,/g, '');
  else if (/^[-+]?\d{1,3}(\.\d{3}){2,}$/.test(v)) v = v.replace(/\./g, '');
  else v = v.replace(',', '.');
  const x = Number(v);
  return Number.isFinite(x) ? x : NaN;
}
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
/** A colour cell as #rrggbb, or '' if it is not one. */
export function parseColour(s) {
  const t = String(s || '').trim();
  if (!HEX.test(t)) return '';
  const h = t.slice(1).toLowerCase();
  return '#' + (h.length === 3 ? [...h].map((c) => c + c).join('') : h);
}
/** What a column of values holds: 'number', 'colour' or 'category' (judged on its non-empty cells). */
export function valueKind(cells) {
  const v = cells.map((c) => String(c || '').trim()).filter(Boolean);
  if (!v.length) return 'number';
  const share = (f) => v.filter(f).length / v.length;
  if (share((c) => Number.isFinite(parseNumber(c))) >= 0.8) return 'number';
  if (share((c) => !!parseColour(c)) >= 0.8) return 'colour';
  return 'category';
}

// ---- places

/**
 * A matcher for places: a name (with the aliases in groups.js, through resolveName), an ISO 3166-1 alpha-3 code
 * or an alpha-2 code. feats are the map's country features (to turn codes into map names). Returns name or null.
 */
export function placeMatcher(feats, resolveName) {
  const byIso = new Map();
  for (const f of feats) {
    const c = isoOf(f);
    if (c && !byIso.has(c)) byIso.set(c, f.properties.name);
  }
  return (text) => {
    const t = String(text || '').trim();
    if (!t) return null;
    const n = resolveName(t);
    if (n) return n;
    const u = t.toUpperCase();
    if (/^[A-Z]{3}$/.test(u)) return byIso.get(u) || null;
    if (/^[A-Z]{2}$/.test(u)) return (ISO.ISO2_3[u] && byIso.get(ISO.ISO2_3[u])) || null;
    return null;
  };
}

/** The closest map name to an unmatched place, for "did you mean", or ''. norm is groups.js's name normaliser. */
export function suggest(text, names, norm) {
  const a = norm(text);
  if (a.length < 3) return '';
  let best = '',
    bd = Infinity;
  for (const n of names) {
    const d = distance(a, norm(n));
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return bd <= Math.max(2, Math.round(a.length * 0.3)) ? best : '';
}
function distance(a, b) {
  if (Math.abs(a.length - b.length) > 6) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

// ---- columns

/**
 * Guess how to read a table: {header, place, value}. place is the column where most cells are places; value the
 * rightmost other column that is mostly numbers (the latest year, in a table of years), else the first other column
 * with anything in it. The first row is a header when it holds no place and no number in those columns while the
 * rows below do.
 */
export function guessColumns(rows, match) {
  const width = Math.max(0, ...rows.map((r) => r.length));
  if (!width) return { header: false, place: 0, value: 1 };
  const body = rows.slice(1, 200),
    share = (col, f) => (body.length ? body.filter((r) => f(r[col] || '')).length / body.length : 0);
  let place = 0,
    pBest = -1;
  for (let c = 0; c < width; c++) {
    const s = share(c, (x) => !!match(x));
    if (s > pBest) {
      pBest = s;
      place = c;
    }
  }
  let value = -1;
  for (let c = width - 1; c >= 0; c--) if (c !== place && share(c, (x) => Number.isFinite(parseNumber(x))) >= 0.5) {
    value = c;
    break;
  }
  if (value < 0) value = [...Array(width).keys()].find((c) => c !== place && share(c, (x) => x !== '') > 0) ?? (place === 0 ? 1 : 0);
  // the place column decides when it is mostly places (a header of years, "2022", "2023", is still a header);
  // otherwise a first row with text where the rows below have numbers
  const first = rows[0] || [];
  const header =
    pBest >= 0.5
      ? !match(first[place] || '') && (first[place] || '') !== ''
      : !Number.isFinite(parseNumber(first[value])) && share(value, (x) => Number.isFinite(parseNumber(x))) >= 0.5;
  return { header, place, value };
}
/** Column names for menus: the header cells, or "Column A", "Column B"... */
export const columnNames = (rows, header) => {
  const width = Math.max(0, ...rows.map((r) => r.length));
  return [...Array(width).keys()].map((c) => (header && rows[0][c] ? rows[0][c] : 'Column ' + letters(c)));
};
const letters = (c) => (c < 26 ? '' : letters(Math.floor(c / 26) - 1)) + String.fromCharCode(65 + (c % 26));

// ---- Google Sheets

/**
 * The CSV address of a Google Sheets link, keeping the tab (gid) the link points to, or '' if it is not one. Works for
 * a sheet shared as "anyone with the link" (/d/<id>/...) and one published to the web (/d/e/<id>/pub...).
 */
export function sheetsCsvUrl(link) {
  let u;
  try {
    u = new URL(String(link).trim());
  } catch (e) {
    return '';
  }
  if (u.hostname !== 'docs.google.com') return '';
  const gid = (/[#&?]gid=(\d+)/.exec(u.hash + '&' + u.search) || [])[1];
  let m = /^\/spreadsheets\/d\/e\/([\w-]+)\//.exec(u.pathname);
  if (m) return 'https://docs.google.com/spreadsheets/d/e/' + m[1] + '/pub?output=csv' + (gid ? '&gid=' + gid : '');
  m = /^\/spreadsheets\/d\/([\w-]+)/.exec(u.pathname);
  if (m) return 'https://docs.google.com/spreadsheets/d/' + m[1] + '/export?format=csv&gid=' + (gid || '0');
  return '';
}

// ---- XLSX

/** Entries of a zip archive in an ArrayBuffer/Uint8Array: Map name -> {method, data: Uint8Array (compressed)}. */
function zipEntries(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
    dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--)
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error('this is not an .xlsx file');
  const count = dv.getUint16(eocd + 10, true),
    out = new Map();
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('this .xlsx file is damaged');
    const method = dv.getUint16(p + 10, true),
      size = dv.getUint32(p + 20, true),
      nameLen = dv.getUint16(p + 28, true),
      extraLen = dv.getUint16(p + 30, true),
      commentLen = dv.getUint16(p + 32, true),
      local = dv.getUint32(p + 42, true),
      name = dec.decode(b.subarray(p + 46, p + 46 + nameLen));
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    out.set(name, { method, data: b.subarray(start, start + size) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
async function entryText(entries, name) {
  const e = entries.get(name);
  if (!e) return '';
  const raw = e.method === 0 ? e.data : e.method === 8 ? new Uint8Array(await inflate(e.data)) : null;
  if (!raw) throw new Error('this .xlsx file uses a compression the editor cannot read');
  return new TextDecoder().decode(raw);
}
const xmlText = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
const colIndex = (ref) => {
  let n = 0;
  for (const ch of /^[A-Z]+/.exec(ref)[0]) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
};

/**
 * Read the sheets of an .xlsx file: [{name, rows: [[cell text]]}]. Cells keep their stored value as text (numbers as
 * written by the spreadsheet, shared and inline strings, TRUE/FALSE); formulas give their last computed value.
 */
export async function readXlsx(bytes) {
  const entries = zipEntries(bytes);
  const shared = [...(await entryText(entries, 'xl/sharedStrings.xml')).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    xmlText([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
  );
  const wb = await entryText(entries, 'xl/workbook.xml'),
    rels = await entryText(entries, 'xl/_rels/workbook.xml.rels');
  const target = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [(/\bId="([^"]+)"/.exec(m[0]) || [])[1], (/\bTarget="([^"]+)"/.exec(m[0]) || [])[1]]));
  const sheets = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = xmlText((/\bname="([^"]*)"/.exec(m[0]) || [])[1] || 'Sheet'),
      rid = (/\br:id="([^"]+)"/.exec(m[0]) || [])[1];
    let t = target.get(rid) || '';
    t = t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '');
    const xml = await entryText(entries, t);
    if (!xml) continue;
    const rows = [];
    for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = [];
      for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = (/\br="([A-Z]+)\d+"/.exec(c[1]) || [])[1],
          type = (/\bt="(\w+)"/.exec(c[1]) || [])[1],
          body = c[2] || '';
        const v = (/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1];
        let text = '';
        if (type === 's') text = shared[+v] || '';
        else if (type === 'inlineStr') text = xmlText([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''));
        else if (type === 'b') text = v === '1' ? 'TRUE' : 'FALSE';
        else if (v !== undefined) text = xmlText(v);
        row[ref ? colIndex(ref) : row.length] = text.trim().slice(0, MAX_CELL);
      }
      for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = '';
      if (row.some((x) => x !== '')) rows.push(row);
      if (rows.length >= MAX_ROWS) break;
    }
    sheets.push({ name, rows });
  }
  if (!sheets.length) throw new Error('no sheets found in this .xlsx file');
  return sheets;
}

// ---- the record saved with a map, and its credit

/**
 * What the map was coloured with: {k:'im', src: 'paste'|'file'|'sheet', name?, url?, t: date read, head?: [place,
 * value], rows: [[place, value]], credit}. Only the two columns used are kept.
 */
export function importRecord(src, info, rows, cols, header, credit) {
  const body = header ? rows.slice(1) : rows;
  const r = { k: 'im', src, t: info.t, rows: body.map((x) => [x[cols.place] || '', x[cols.value] || '']).filter((x) => x[0] || x[1]), credit: String(credit || '').trim().slice(0, 200) };
  if (header) r.head = [rows[0][cols.place] || '', rows[0][cols.value] || ''];
  if (info.name) r.name = String(info.name).slice(0, 120);
  if (info.url) r.url = String(info.url).slice(0, 500);
  return r;
}
/** A saved record checked (maps are untrusted input), or null. */
export function validImport(r) {
  if (!r || typeof r !== 'object' || r.k !== 'im' || !['paste', 'file', 'sheet'].includes(r.src) || !Array.isArray(r.rows)) return null;
  if (typeof r.t !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.t)) return null;
  const cell = (x) => (typeof x === 'string' || typeof x === 'number' ? String(x).slice(0, MAX_CELL) : '');
  const out = { k: 'im', src: r.src, t: r.t, rows: r.rows.slice(0, MAX_ROWS).filter(Array.isArray).map((x) => [cell(x[0]), cell(x[1])]), credit: typeof r.credit === 'string' ? r.credit.slice(0, 200) : '' };
  if (Array.isArray(r.head)) out.head = [cell(r.head[0]), cell(r.head[1])];
  if (typeof r.name === 'string') out.name = r.name.slice(0, 120);
  if (r.src === 'sheet' && typeof r.url === 'string' && sheetsCsvUrl(r.url)) out.url = r.url.slice(0, 500);
  return out;
}
const UNCHECKED = "supplied by the map's author and not checked by Ecumene";
/** {short, detail} credit for exports, in the same shape as statistics (statsrc.js). */
export function importCredit(r) {
  if (!r) return null;
  const from = r.src === 'sheet' ? 'a Google Sheets link (' + r.url + '), read on ' + r.t : r.src === 'file' ? 'the file ' + (r.name || '') + ', read on ' + r.t : 'rows pasted on ' + r.t;
  return {
    short: r.credit ? r.credit : "supplied by the map's author, not checked by Ecumene",
    detail:
      'Data: ' + (r.head ? r.head[1] + ', ' : '') + r.rows.length + ' rows from ' + from + '. ' + (r.credit ? 'Source given by the map’s author: ' + r.credit + '. Not checked by Ecumene.' : 'No source was given: the data was ' + UNCHECKED + '.'),
  };
}
