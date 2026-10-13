// Country fills.
import { app, emit, redraw } from './store.js';
import { geo } from './data.js';
import { setCountryColor } from './gl.js';
import { commit } from './history.js';

/** Fill a country by name with a hex colour, or clear it (null). */
export function setFill(name, col) {
  const id = geo.nameId.get(name);
  if (col) app.fills.set(name, col);
  else app.fills.delete(name);
  setCountryColor(id, col);
}
/** Paint several countries one colour as one undo step. Returns true if anything changed. */
export function paintMany(names, col) {
  let changed = false;
  for (const n of names)
    if (app.fills.get(n) !== col) {
      setFill(n, col);
      changed = true;
    }
  if (changed) {
    emit('legend');
    redraw();
    commit();
  }
  return changed;
}
/** Click behaviour: paint with the active colour, or clear if already that colour. */
export function toggleFill(name) {
  setFill(name, app.fills.get(name) === app.active ? null : app.active);
  emit('legend');
  redraw();
  commit();
}
export function clearFills() {
  [...app.fills.keys()].forEach((n) => setFill(n, null));
  emit('legend');
  redraw();
  commit();
}
/** Move every country of one colour to another, keeping its label and legend position. */
export function recolor(from, to) {
  if (from === to) return;
  const L = app.legend,
    names = [];
  app.fills.forEach((c, n) => {
    if (c === from) names.push(n);
  });
  names.forEach((n) => setFill(n, to));
  if (app.labels[from] && !app.labels[to]) app.labels[to] = app.labels[from];
  delete app.labels[from];
  const i = L.order.indexOf(from);
  if (i >= 0) {
    if (L.order.includes(to)) L.order.splice(i, 1);
    else L.order[i] = to;
  }
}
/** Legend colour order: remembered order first, then any new colours. */
export function legendColours() {
  const used = new Set(app.fills.values()),
    L = app.legend;
  const o = L.order.filter((c) => used.has(c));
  used.forEach((c) => {
    if (!o.includes(c)) o.push(c);
  });
  L.order = o;
  return o;
}
