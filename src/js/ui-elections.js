// Paint panel: the Election picker. Starting an election map clears the map's colors (one undo step), switches on
// Subdivisions with the election's layer, puts the party colors in the palette (US elections), draws white
// subdivision borders and shows the seat counter for that election. The Senate election map also marks the states
// with no race that year.
import { app, emit, redraw } from './store.js';
import { setFill } from './paint.js';
import { commit } from './history.js';
import { animate, centreOn, setZoom } from './view.js';
import { loadUnits, setUnit } from './units.js';
import { refreshSub } from './input.js';
import { ELECTIONS, electionById, US_PARTIES } from './seats.js';
import './seatsrc.js'; // registers the elections built from bundled data
import { PAINT_SETS } from './schemes.js';
import { patternPaint } from './patterns.js';
import { $, el, note } from './util.js';

/** The palette set for US election maps: each party's shades, then independent and toss-up. */
export const US_SET = 'US elections';
PAINT_SETS[US_SET] = {
  c: US_PARTIES.flatMap((p) => p.paints.map((q) => q[0])),
  note: 'Party colors: safe, likely and lean for each party, independent, and toss-up (not counted for anyone). Not checked for color-blind safety.',
};
/** Paint and legend name for states with no race in an election year (no seats, so the counter leaves them out). */
export const NO_RACE = patternPaint('diag', '#ececec', '#b4b4b4');

// where to look, and the width of the lines between units and between states or nations
const VIEW = {
  'United States of America': { at: [-98, 39], zoom: 3.2 },
  'United Kingdom': { at: [-3, 55], zoom: 5 },
  Ireland: { at: [-8, 53.4], zoom: 9 },
};
const lines = (e) =>
  e.layer === '' ? { w: 1.6, gw: 2.5 } : e.country === 'United States of America' ? { w: 0.5, gw: 2 } : { w: 0.5, gw: 1.6 };

/** Set up a blank map of an election (ELECTIONS id). Returns a promise that settles once its units are loaded. */
export async function startElection(id, confirmFn = (m) => window.confirm(m)) {
  const E = electionById(id);
  if (!E || !app.ready) return false;
  if (
    (app.fills.size || app.units.size || app.objects.length) &&
    !confirmFn('Start a new ' + E.menu + ' map? This clears the colors on the map (Undo brings them back).')
  )
    return false;
  note('Loading ' + E.menu + '…');
  let U;
  try {
    U = await loadUnits(E.country, E.layer);
  } catch (e) {
    note('Could not load the map of ' + E.menu + '. Open the page through a web server (see README).', 1);
    return false;
  }
  // a blank map: no country or subdivision colors, statistic or table of data
  [...app.fills.keys()].forEach((n) => setFill(n, null));
  app.units.clear();
  for (const k in app.labels) delete app.labels[k];
  app.stat = app.imported = null;
  emit('stat');
  // paint the election's units in Subdivisions mode, unit by unit
  Object.assign(app.sub, { on: true, detail: 'u' });
  app.sub.layer[E.country] = E.layer;
  // the party colors, named, in the palette and legend order
  const us = E.country === 'United States of America';
  if (us) {
    app.paintSet = US_SET;
    for (const p of US_PARTIES) for (const [c, l] of p.paints) app.labels[c] = l;
    app.active = app.solid = US_PARTIES[0].paints[0][0];
    emit('palette');
  }
  // a Senate election: the states without a race that year are marked and named in the legend
  if (E.held) {
    for (const f of U.feats) if (f.properties.ty === 'State' && !E.seats(f.properties)) setUnit(E.country, f.properties.c, NO_RACE);
    app.labels[NO_RACE] = E.none;
  }
  app.legend.order = us ? [...US_PARTIES.flatMap((p) => p.paints.map((q) => q[0])), NO_RACE] : [];
  app.legend.title = E.menu;
  app.legend.show = true;
  Object.assign(app.sublines, { on: true, col: '#ffffff' }, lines(E));
  Object.assign(app.seatbar, { show: true, el: E.id });
  const v = VIEW[E.country];
  if (v) {
    setZoom(v.zoom);
    animate(centreOn(v.at));
  }
  emit('legend');
  emit('legendopts');
  emit('style');
  refreshSub();
  redraw();
  commit();
  note(
    E.menu +
      ': click ' +
      (E.layer ? 'a constituency' : 'a state') +
      ' to paint it' +
      (us ? ' in the chosen party color.' : '.') +
      (E.split
        ? ' For a state with one senator of each party, choose one party’s color, set the pattern color to the other’s and pick a stripe pattern.'
        : ''),
  );
  return true;
}

export function initElections() {
  const sel = $('elk');
  sel.replaceChildren(...ELECTIONS.map((e) => el('option', { value: e.id, textContent: e.menu })));
  $('elgo').onclick = () => startElection(sel.value);
}
