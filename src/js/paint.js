// Country fills.
import { app, emit, redraw } from './store.js';
import { geo } from './data.js';
import { setCountryColor } from './gl.js';
import { commit } from './history.js';
import { clearUnits, unitShown } from './units.js';

/** Fill a country by name with a hex colour, or clear it (null). */
export function setFill(name, col) {
  const id = geo.nameId.get(name);
  if (col) app.fills.set(name, col);
  else app.fills.delete(name);
  setCountryColor(id, col);
}
/** Paint several countries one colour as one undo step (clearing their painted subdivisions). Returns true if anything changed. */
export function paintMany(names, col) {
  let changed = false;
  for (const n of names) {
    if (clearUnits(n)) changed = true;
    if (app.fills.get(n) !== col) {
      setFill(n, col);
      changed = true;
    }
  }
  if (changed) {
    emit('legend');
    redraw();
    commit();
  }
  return changed;
}
/**
 * Click behaviour: paint with the active colour, or clear if already that colour. A country with painted
 * subdivisions is painted whole instead, so one click turns it back into a single colour.
 */
export function toggleFill(name) {
  const had = clearUnits(name);
  setFill(name, !had && app.fills.get(name) === app.active ? null : app.active);
  emit('legend');
  redraw();
  commit();
}
export function clearFills() {
  [...app.fills.keys()].forEach((n) => setFill(n, null));
  app.units.clear();
  if (app.stat || app.imported) {
    // the title and credit came with the statistic or your table
    app.legend.title = '';
    app.stat = app.imported = null;
    emit('stat');
  }
  emit('legend');
  redraw();
  commit();
}
/** Move every country and subdivision of one colour to another, keeping its label and legend position. */
export function recolor(from, to) {
  if (from === to) return;
  const L = app.legend,
    names = [];
  app.fills.forEach((c, n) => {
    if (c === from) names.push(n);
  });
  names.forEach((n) => setFill(n, to));
  app.units.forEach((c, k) => {
    if (c === from) app.units.set(k, to);
  });
  if (app.labels[from] && !app.labels[to]) app.labels[to] = app.labels[from];
  delete app.labels[from];
  const i = L.order.indexOf(from);
  if (i >= 0) {
    if (L.order.includes(to)) L.order.splice(i, 1);
    else L.order[i] = to;
  }
}
/** Remove one colour from every country and subdivision. */
export function removeColour(col) {
  [...app.fills.keys()].filter((k) => app.fills.get(k) === col).forEach((k) => setFill(k, null));
  [...app.units.keys()].filter((k) => app.units.get(k) === col).forEach((k) => app.units.delete(k));
}
/** How many countries and subdivisions use each colour. */
export function colourCounts() {
  const n = {};
  for (const m of [app.fills, app.units]) m.forEach((c) => (n[c] = (n[c] || 0) + 1));
  return n;
}
/** Legend colour order: remembered order first, then any new colours. */
export function legendColours() {
  const used = new Set([...app.fills.values(), ...app.units.values()]),
    L = app.legend;
  const o = L.order.filter((c) => used.has(c));
  used.forEach((c) => {
    if (!o.includes(c)) o.push(c);
  });
  L.order = o;
  return o;
}
/**
 * The legend's colors that something on the map has, in legend order: a color only on units of a dated layer not in
 * force on the day shown is left out (it keeps its place in the order for when it shows again).
 */
export function shownColours() {
  const shown = new Set(app.fills.values());
  app.units.forEach((c, k) => {
    if (unitShown(k)) shown.add(c);
  });
  return legendColours().filter((c) => shown.has(c));
}
