// The second line of the hover tag: what the map says about the place under the pointer. A statistic's value (with its
// year), a value from your own data, the legend name of a hand-painted color, and on election maps the seats a state
// or constituency carries ("Democratic · 54 electoral votes").
import { app } from './store.js';
import { geo } from './data.js';
import { isoOf, ELECTORAL_VOTES, electoralName, NO_DATA_PAINT, NO_DATA_LABEL } from './stats.js';
import { indicatorOf } from './statsrc.js';
import { unitKey, layerOfCode } from './units.js';
import { shownElection } from './seatbar.js';
import { placeMatcher } from './table.js';
import Ecu from '../groups.js';

const fmt = (x) => (Math.abs(x) >= 1e4 ? Math.round(x).toLocaleString('en-US') : String(+x.toPrecision(4)));
const label = (paint) => (paint && paint !== NO_DATA_PAINT ? (app.labels[paint] || '').trim() : '');

// your own data: its rows matched to map names, kept until the table changes
let matched = { rec: null, by: null };
function importedValue(name) {
  const r = app.imported;
  if (matched.rec !== r) {
    const match = placeMatcher(geo.feats, Ecu.matcher(geo.names)),
      by = new Map();
    for (const [p, v] of r.rows) {
      const n = match(p);
      if (n && v !== '') by.set(n, v);
    }
    matched = { rec: r, by };
  }
  return matched.by.get(name);
}

/** What the map says about a country, or ''. */
export function countryInfo(name) {
  const st = app.stat,
    paint = app.fills.get(name);
  if (st && st.k === 'wb') {
    const ind = indicatorOf(st.c),
      f = geo.feats.find((x) => x.properties.name === name),
      iso = f ? isoOf(f) : '',
      v = iso ? st.v[iso] : undefined;
    if (v === undefined) return NO_DATA_LABEL;
    return (ind ? ind.menu : st.c) + ': ' + fmt(v) + ' (' + (st.ys ? st.ys[iso] : st.y) + ')';
  }
  if (app.imported) {
    const v = importedValue(name);
    if (v === undefined) return paint === NO_DATA_PAINT ? NO_DATA_LABEL : '';
    const head = app.imported.head && app.imported.head[1];
    return (head ? head + ': ' : '') + v;
  }
  return label(paint);
}

/**
 * What the map says about subdivisions (loaded unit features of a country), or ''. feats is the unit under the
 * pointer, or in Subdivisions mode the region or part a click paints: its seats add up, and its color label shows
 * when every unit has the same paint.
 */
export function unitInfo(country, feats) {
  const f = feats[0],
    layer = layerOfCode(f.properties.c);
  // the electoral votes statistic colors the states by their votes
  if (app.stat && app.stat.k === 'ev' && country === 'United States of America' && !layer) {
    const v = feats.reduce((s, x) => s + (ELECTORAL_VOTES[electoralName(x.properties)] || 0), 0);
    return v ? v + ' electoral vote' + (v === 1 ? '' : 's') : '';
  }
  const paints = new Set(feats.map((x) => app.units.get(unitKey(country, x.properties.c))));
  // the seats, while the seat counter shows this election
  const name = paints.size === 1 ? label([...paints][0]) : '',
    el = app.seatbar.show && !app.stat ? shownElection() : null,
    seats = el && el.country === country && el.layer === layer ? feats.reduce((s, x) => s + el.seats(x.properties), 0) : 0;
  const s = seats ? seats + ' ' + (seats === 1 ? el.unit.replace(/s$/, '') : el.unit) : '';
  return [name, s].filter(Boolean).join(' · ');
}
