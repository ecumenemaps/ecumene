// The second line of the hover tag: what the map says about the place under the pointer. A statistic's value (with its
// year), a value from your own data, the legend name of a hand-painted color, and on election maps the seats a state
// or constituency carries ("Democratic · 54 electoral votes").
import { app } from './store.js';
import { geo } from './data.js';
import { isoOf, ELECTORAL_VOTES, electoralName, NO_DATA_PAINT, NO_DATA_LABEL } from './stats.js';
import { indicatorOf } from './statsrc.js';
import { unitKey, layerOfCode } from './units.js';
import { ELECTIONS } from './seats.js';
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

/** What the map says about a subdivision (a loaded unit feature of a country), or ''. */
export function unitInfo(country, f) {
  const code = f.properties.c,
    layer = layerOfCode(code);
  // the electoral votes statistic colors the states by their votes
  if (app.stat && app.stat.k === 'ev' && country === 'United States of America' && !layer) {
    const v = ELECTORAL_VOTES[electoralName(f.properties)];
    return v ? v + ' electoral vote' + (v === 1 ? '' : 's') : '';
  }
  const name = label(app.units.get(unitKey(country, code))),
    el = ELECTIONS.find((e) => e.country === country && e.layer === layer),
    seats = el ? el.seats(f.properties) : 0;
  const s = seats ? seats + ' ' + (el.id === 'us-ec' ? 'electoral vote' : 'seat') + (seats === 1 ? '' : 's') : '';
  return [name, s].filter(Boolean).join(' · ');
}
