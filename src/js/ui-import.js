// Data panel: your own data. Paste a table, open a CSV/TSV/XLSX file, or load a Google Sheets link (read from Google
// only when the button is pressed); pick the column of places and of values from a preview; color the map. The rows
// used are saved with the map (app.imported, table.js importRecord), so reopening it never changes it.
import { app, on, emit, redraw } from './store.js';
import { geo } from './data.js';
import { setFill } from './paint.js';
import { commit } from './history.js';
import { $, el, note, plural } from './util.js';
import { PAINT_SETS } from './schemes.js';
import Ecu from '../groups.js';
import { parseText, parseNumber, parseColour, valueKind, placeMatcher, suggest, guessColumns, columnNames, sheetsCsvUrl, readXlsx, importRecord, MAX_ROWS } from './table.js';
import { NO_DATA_PAINT, NO_DATA_LABEL } from './stats.js';

const today = () => new Date().toISOString().slice(0, 10);
const listOf = (a, n) => a.slice(0, n).join(', ') + (a.length > n ? ' and ' + (a.length - n) + ' more' : '');
const MAX_FILE = 10 * 1024 * 1024;

let paintRows, match;
// the table being looked at: {src, rows, t, name?, url?, sheets?, cut?}; the columns chosen; whether row 1 is a header
let T = null,
  cols = { place: 0, value: 1 },
  header = false;

export function initImport(colourRows) {
  paintRows = colourRows;
  match = placeMatcher(geo.feats, Ecu.matcher(geo.names));
  let timer = 0;
  $('dd').addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const r = parseText($('dd').value);
      setTable(r.rows.length ? { src: 'paste', t: today(), rows: r.rows, cut: r.cut } : null);
    }, 250);
  });
  $('dfo').onclick = () => $('dfi').click();
  $('dfi').onchange = () => {
    const f = $('dfi').files[0];
    $('dfi').value = '';
    if (f) openFile(f);
  };
  $('dsl').onclick = loadSheet;
  $('dpc').onchange = () => ((cols.place = +$('dpc').value), preview());
  $('dvc').onchange = () => ((cols.value = +$('dvc').value), preview());
  $('dhd').onchange = () => ((header = $('dhd').checked), fillMenus(), preview());
  $('dsh').onchange = () => useSheet(+$('dsh').value);
  on('import', sync);
  sync();
}

/** Show a new table: guess its columns and header, then preview it. */
function setTable(t) {
  T = t;
  if (!T) {
    $('dpv').hidden = true;
    return;
  }
  const g = guessColumns(T.rows, match);
  cols = { place: g.place, value: g.value };
  header = g.header;
  fillMenus();
  preview();
}
function fillMenus() {
  const names = columnNames(T.rows, header),
    opts = () => names.map((n, i) => el('option', { value: String(i), textContent: n }));
  $('dpc').replaceChildren(...opts());
  $('dvc').replaceChildren(...opts());
  $('dpc').value = String(cols.place);
  $('dvc').value = String(cols.value);
  $('dhd').checked = header;
}
const bodyRows = () => (header ? T.rows.slice(1) : T.rows);

/** The first rows, the places that were not recognised (with "did you mean"), and what the values are. */
function preview() {
  if (!T) return;
  $('dpv').hidden = false;
  const names = columnNames(T.rows, header),
    body = bodyRows();
  const head = el('tr', null, ...names.map((n, i) => el('th', { textContent: n, class: i === cols.place ? 'p' : i === cols.value ? 'v' : '' })));
  const rows = body.slice(0, 6).map((r) =>
    el('tr', null, ...names.map((n, i) => el('td', { textContent: r[i] || '', class: (i === cols.place ? 'p' : i === cols.value ? 'v' : '') + (i === cols.place && r[i] && !match(r[i]) ? ' x' : '') }))),
  );
  $('dtb').replaceChildren(el('table', null, head, ...rows));
  const places = body.map((r) => r[cols.place] || '').filter(Boolean),
    unknown = [...new Set(places.filter((p) => !match(p)))],
    kind = valueKind(body.map((r) => r[cols.value] || ''));
  const from = T.src === 'sheet' ? 'From the Google Sheet. ' : T.src === 'file' ? 'From ' + T.name + '. ' : '';
  let m = from + plural(body.length, 'row', 'rows') + ', ' + (places.length - unknown.length) + ' recognised as places. Values: ' + { number: 'numbers', colour: 'colors', category: 'categories' }[kind] + '.';
  if (unknown.length)
    m +=
      ' Not recognised: ' +
      listOf(
        unknown.map((u) => {
          const s = suggest(u, geo.names, Ecu.norm);
          return s ? u + ' (did you mean ' + s + '?)' : u;
        }),
        5,
      ) +
      '.';
  if (T.cut) m += ' Only the first ' + MAX_ROWS + ' rows are read.';
  $('dpi').textContent = m;
}

async function openFile(f) {
  if (f.size > MAX_FILE) return note('That file is over 10 MB; use a smaller extract.', 1);
  try {
    if (/\.xlsx$/i.test(f.name)) {
      const sheets = await readXlsx(await f.arrayBuffer());
      $('dsh').replaceChildren(...sheets.map((s, i) => el('option', { value: String(i), textContent: 'Sheet: ' + s.name })));
      $('dsh').hidden = sheets.length < 2;
      $('dd').value = '';
      T = { src: 'file', name: f.name, t: today(), sheets };
      useSheet(0);
    } else {
      const r = parseText(await f.text());
      $('dsh').hidden = true;
      $('dd').value = '';
      setTable({ src: 'file', name: f.name, t: today(), rows: r.rows, cut: r.cut });
    }
    note('Read ' + f.name + '.');
  } catch (e) {
    note('Could not read ' + f.name + ': ' + (e && e.message ? e.message : e) + '.', 1);
  }
}
function useSheet(i) {
  const s = T.sheets[i];
  $('dsh').value = String(i);
  setTable({ ...T, rows: s.rows, sheet: s.name, cut: s.rows.length >= MAX_ROWS });
}

async function loadSheet() {
  const link = $('dsu').value.trim(),
    url = sheetsCsvUrl(link);
  if (!url) return note('That is not a Google Sheets link. Copy the link from the sheet’s Share button, or from File, Share, Publish to web.', 1);
  note('Reading the sheet from Google…');
  try {
    const r = await fetch(url);
    const type = r.headers.get('content-type') || '';
    if (!r.ok || /html/.test(type)) throw new Error(r.ok ? 'Google asked to sign in' : 'Google answered HTTP ' + r.status);
    const t = parseText(await r.text());
    $('dsh').hidden = true;
    $('dd').value = '';
    setTable({ src: 'sheet', url: link, t: today(), rows: t.rows, cut: t.cut });
    note('Read the sheet: ' + plural(t.rows.length, 'row', 'rows') + '.');
  } catch (e) {
    note('Could not read the sheet (' + (e && e.message ? e.message : e) + '). Share it as “anyone with the link”, or publish it to the web, and try again.', 1);
  }
}

/** Show the table the map was coloured with (after opening a map, or undo), without reading anything again. */
function sync() {
  const r = app.imported;
  if (!r) return;
  const rows = (r.head ? [r.head] : []).concat(r.rows);
  $('dsrc').value = r.credit || '';
  $('dsu').value = r.src === 'sheet' ? r.url || '' : $('dsu').value;
  $('dd').value = r.src === 'paste' ? rows.map((x) => x.join('\t')).join('\n') : '';
  $('dsh').hidden = true;
  T = { src: r.src, t: r.t, rows, name: r.name, url: r.url };
  cols = { place: 0, value: 1 };
  header = !!r.head;
  fillMenus();
  preview();
}

/** Color the map with the table (one undo step); a statistic chosen above is used instead (ui-paint.js). */
export function colourImport() {
  if (!T || !T.rows.length) return note('Paste some rows, open a file or load a sheet first.', 1);
  if (cols.place === cols.value) return note('Choose different columns for places and values.', 1);
  const rows = [],
    unknown = [],
    at = new Map();
  for (const r of bodyRows()) {
    const p = r[cols.place] || '',
      v = r[cols.value] || '';
    if (!p) continue;
    const n = match(p);
    if (!n) {
      unknown.push(p);
      continue;
    }
    if (v === '') continue;
    if (at.has(n)) rows[at.get(n)].raw = v;
    else {
      at.set(n, rows.length);
      rows.push({ name: n, raw: v });
    }
  }
  if (!rows.length) return note('None of the places in that column was recognised. Choose the column of places.', 1);
  const kind = valueKind(rows.map((r) => r.raw)),
    S = PAINT_SETS[app.paintSet] || PAINT_SETS.Default;
  const cats = kind === 'category' ? [...new Set(rows.map((r) => r.raw))] : [];
  if (cats.length > S.c.length)
    return note(plural(cats.length, 'category', 'categories') + ' is more than the ' + S.c.length + ' colors of the ' + app.paintSet + ' paint set. Use fewer categories, or numbers.', 1);
  const prevAuto = app.imported && app.imported.head ? app.imported.head[1] : '';
  // the table colors the whole map: what was painted before goes
  [...app.fills.keys()].forEach((n) => setFill(n, null));
  app.units.clear();
  for (const k in app.labels) delete app.labels[k];
  let ok = [],
    used = 0;
  if (kind === 'number') {
    ok = rows.filter((r) => Number.isFinite((r.value = parseNumber(r.raw))));
    used = ok.length ? paintRows(ok, (x, c) => setFill(x.name, c)) : 0;
  } else if (kind === 'colour') {
    const order = [];
    for (const r of rows) {
      const c = parseColour(r.raw);
      if (!c) continue;
      ok.push(r);
      setFill(r.name, c);
      if (!order.includes(c)) order.push(c);
    }
    app.legend.order = order;
    used = order.length;
  } else {
    cats.forEach((c, i) => (app.labels[S.c[i].toLowerCase()] = c));
    for (const r of rows) setFill(r.name, S.c[cats.indexOf(r.raw)].toLowerCase());
    ok = rows;
    app.legend.order = cats.map((c, i) => S.c[i].toLowerCase());
    used = cats.length;
  }
  const has = new Set(ok.map((r) => r.name)),
    without = geo.names.filter((n) => !has.has(n));
  if (app.data.nd && without.length) {
    for (const n of without) setFill(n, NO_DATA_PAINT);
    app.labels[NO_DATA_PAINT] = NO_DATA_LABEL;
    app.legend.order.push(NO_DATA_PAINT);
  }
  // the column's heading becomes the legend title, unless one was typed
  const auto = header ? T.rows[0][cols.value] || '' : '';
  if (auto && (!app.legend.title || app.stat || app.legend.title === prevAuto)) app.legend.title = auto;
  app.legend.show = true;
  app.imported = importRecord(T.src, T, T.rows, cols, header, $('dsrc').value);
  app.stat = null;
  emit('stat');
  emit('legend');
  redraw();
  commit();
  const skipped = rows.length - ok.length;
  let m = plural(ok.length, 'country', 'countries') + ' colored' + (kind === 'number' ? ' in ' + plural(used, 'class', 'classes') : kind === 'category' ? ' in ' + plural(used, 'category', 'categories') : '') + '.';
  if (skipped) m += ' Skipped ' + skipped + ' with a value that is not ' + (kind === 'colour' ? 'a color' : 'a number') + '.';
  if (unknown.length) m += ' Not recognised: ' + listOf([...new Set(unknown)], 5) + '.';
  if (!$('dsrc').value.trim()) m += ' No source given: exports will say the data was supplied by you and not checked.';
  note(m, unknown.length > 0 || skipped > 0);
}
