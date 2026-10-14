// Data panel: color the map with a statistic. World Bank indicators are fetched from the World Bank's API in the
// browser when one is chosen (the only request this editor makes to anyone else, and only then); the numbers used
// are saved with the map (app.stat), so reopening it never changes them. The US electoral votes are bundled.
import { app, on, emit, redraw } from './store.js';
import { geo } from './data.js';
import { setFill } from './paint.js';
import { setUnit, loadUnits } from './units.js';
import { commit } from './history.js';
import { animate, centreOn } from './view.js';
import { $, el, note, plural } from './util.js';
import {
  wbURL,
  parseWB,
  chooseYear,
  yearsWithData,
  coverage,
  valuesFor,
  wbRecord,
  wbTitle,
  matchCountries,
  yearSpan,
  electoralName,
  ELECTORAL_VOTES,
  ELECTORAL_TITLE,
  NO_DATA_PAINT,
  NO_DATA_LABEL,
} from './stats.js';
import { WB, EV, indicatorOf } from './statsrc.js';

const US = 'United States of America';
const today = () => new Date().toISOString().slice(0, 10);
const listOf = (a, n) => a.slice(0, n).join(', ') + (a.length > n ? ' and ' + (a.length - n) + ' more' : '');

let paintRows; // colourRows from ui-paint.js
const cache = new Map(); // indicator code -> {byYear, t} fetched this session
let token = 0; // answers to older choices are ignored

/** Is a statistic chosen in the menu (rather than pasted rows)? */
export const statChosen = () => !!$('dst').value;

const info = (msg, bad) => {
  const p = $('dsti');
  p.textContent = msg;
  p.style.color = bad ? '#c0392b' : '';
};
const sourceLine = (code) => WB.credit + ', ' + code + ', ' + WB.licence.name + '.';

export function initStats(colourRows) {
  paintRows = colourRows;
  $('dst').replaceChildren(
    el('option', { value: '', textContent: 'None (use the pasted rows below)' }),
    el(
      'optgroup',
      { label: 'World Bank, loaded when chosen' },
      ...WB.indicators.map((i) => el('option', { value: 'wb:' + i.code, textContent: i.menu })),
    ),
    el('optgroup', { label: 'United States' }, el('option', { value: 'ev', textContent: 'Electoral votes per state (2024 and 2028)' })),
  );
  $('dst').onchange = choose;
  $('dyr').onchange = () => info(yearNote());
  $('dstr').onclick = () => load(code(), true);
  $('dnd').onchange = () => (app.data.nd = $('dnd').checked);
  on('stat', sync);
  sync();
}

const code = () => ($('dst').value.startsWith('wb:') ? $('dst').value.slice(3) : '');

function choose() {
  token++;
  const v = $('dst').value;
  $('dstw').hidden = !code();
  if (code()) load(code(), false);
  else
    info(
      v === 'ev'
        ? 'Colors the 50 states and DC by their electoral votes, from the 2020 Census apportionment (' +
            EV.publisher +
            ', public domain). Maine and Nebraska can split their votes; the map shows each state’s total.'
        : '',
    );
}

/** Show what the map was colored with (after opening a map, undo or a paste), without fetching anything. */
function sync() {
  $('dnd').checked = !!app.data.nd;
  const r = app.stat;
  if (!r) {
    // the map's statistic went away (cleared, pasted over, undone): drop the choice that showed it
    if (statChosen()) {
      $('dst').value = '';
      choose();
    }
    return;
  }
  const key = r.k === 'ev' ? 'ev' : 'wb:' + r.c;
  // just colored from this menu: it already shows the loaded years
  if ($('dst').value === key && (r.k === 'ev' || cache.has(r.c) || $('dyr').value === 'saved')) return;
  token++;
  if (r.k === 'ev') {
    $('dst').value = 'ev';
    choose();
    return;
  }
  if (!indicatorOf(r.c)) return;
  $('dst').value = key;
  $('dstw').hidden = false;
  const [a, b] = yearSpan(r);
  $('dyr').replaceChildren(
    el('option', { value: 'saved', textContent: 'Saved with this map: ' + (r.y === 'latest' ? 'most recent, ' + a + '–' + b : r.y) }),
  );
  info(
    'Saved with this map: ' +
      plural(Object.keys(r.v).length, 'country', 'countries') +
      ', fetched from the World Bank on ' +
      r.t +
      '. Reopening the map never changes these numbers; "Fetch again" gets the current ones. ' +
      sourceLine(r.c),
  );
}

async function load(c, force) {
  if (!c) return;
  const mine = ++token;
  if (!force && cache.has(c)) return fill(c);
  $('dyr').replaceChildren(el('option', { textContent: 'Loading…' }));
  $('dyr').disabled = $('dstr').disabled = true;
  info('Loading from api.worldbank.org (the only request this editor makes to another site, and only when you choose a statistic)…');
  try {
    const r = await fetch(wbURL(c, new Date().getFullYear()));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const byYear = parseWB(await r.json());
    if (mine !== token) return;
    if (!yearsWithData(byYear).length) throw new Error('the World Bank has no values for it');
    cache.set(c, { byYear, t: today() });
    fill(c);
  } catch (e) {
    if (mine !== token) return;
    $('dyr').replaceChildren(el('option', { textContent: 'Not loaded' }));
    info('Could not load this statistic: ' + (e && e.message ? e.message : e) + '. Check the connection and choose "Fetch again".', 1);
  } finally {
    if (mine === token) $('dyr').disabled = $('dstr').disabled = false;
  }
}

/** Fill the year menu from the loaded data; the default is the latest year with good coverage. */
function fill(c) {
  const { byYear, t } = cache.get(c),
    n = coverage(byYear),
    best = chooseYear(byYear);
  $('dyr').replaceChildren(
    el('option', { value: 'auto', textContent: 'Latest with good coverage (' + best + ')' }),
    el('option', { value: 'latest', textContent: 'Most recent for each country' }),
    ...yearsWithData(byYear).map((y) =>
      el('option', { value: String(y), textContent: y + ' (' + plural(n[y], 'country', 'countries') + ')' }),
    ),
  );
  $('dyr').value = 'auto';
  $('dyr').disabled = $('dstr').disabled = false;
  info(yearNote());
}
function yearNote() {
  const c = code(),
    d = cache.get(c);
  if (!d) return '';
  let m = sourceLine(c) + ' Fetched today (' + d.t + ') and saved with the map.';
  if ($('dyr').value === 'latest') m += ' Each country is shown with its own most recent year, and the legend and credits say so.';
  return m;
}

/** Color the map with the chosen statistic (one undo step). */
export async function colourStat() {
  if ($('dst').value === 'ev') return colourElectoral();
  const c = code(),
    ind = indicatorOf(c);
  if (!ind) return;
  let rec;
  if ($('dyr').value === 'saved' && app.stat && app.stat.c === c) rec = app.stat;
  else {
    const d = cache.get(c);
    if (!d) return note('This statistic has not loaded yet.', 1);
    const y = $('dyr').value,
      year = y === 'auto' ? chooseYear(d.byYear) : y === 'latest' ? 'latest' : +y,
      vals = valuesFor(d.byYear, year);
    if (!vals) return note('There are no values for ' + year + '.', 1);
    rec = wbRecord(c, year, d.t, vals);
  }
  const m = matchCountries(geo.feats, rec);
  clearAll();
  const used = paintRows(
    [...m.with].map(([name, x]) => ({ name, value: x.value })),
    (x, col) => setFill(x.name, col),
  );
  const mark = app.data.nd && m.without.length > 0;
  if (mark) {
    for (const n of m.without) setFill(n, NO_DATA_PAINT);
    app.labels[NO_DATA_PAINT] = NO_DATA_LABEL;
    app.legend.order.push(NO_DATA_PAINT);
  }
  app.legend.title = wbTitle(ind, rec);
  app.legend.show = true;
  app.stat = rec;
  done();
  let msg = plural(m.with.size, 'country', 'countries') + ' colored in ' + plural(used, 'class', 'classes') + '.';
  if (m.without.length)
    msg +=
      ' No data for ' + plural(m.without.length, 'place', 'places') + (mark ? ' (marked)' : '') + ', such as ' + listOf(m.without, 4) + '.';
  note(msg);
}

async function colourElectoral() {
  note('Loading the states…');
  const U = await loadUnits(US, '').catch(() => null);
  if (!U) return note('Could not load the US states.', 1);
  clearAll();
  app.sub.layer[US] = '';
  const rows = U.feats.map((f) => ({ f, value: ELECTORAL_VOTES[electoralName(f.properties)] })).filter((x) => x.value !== undefined);
  const used = paintRows(rows, (x, col) => setUnit(US, x.f.properties.c, col));
  app.legend.title = ELECTORAL_TITLE;
  app.legend.show = true;
  app.stat = { k: 'ev' };
  done();
  animate(centreOn([-98, 39]));
  note(
    plural(rows.length, 'state', 'states') +
      ' (with DC) colored in ' +
      plural(used, 'class', 'classes') +
      '. Only the United States is colored.',
  );
}

/** A statistic colors the whole map: what was painted before goes. */
function clearAll() {
  [...app.fills.keys()].forEach((n) => setFill(n, null));
  app.units.clear();
  for (const k in app.labels) delete app.labels[k];
}
function done() {
  emit('stat');
  emit('legend');
  redraw();
  commit();
}
