// Creating and editing map objects: drawing mode, selection, exact outlines.
import { app, emit, redraw } from './store.js';
import { newObj } from './objects.js';
import { geoAt, onFront, setProj, proj } from './view.js';
import { commit } from './history.js';
import { note } from './util.js';

const HELP = {
  region:
    'Click on the globe to add points. Drag to rotate. Click the first point or press Enter to finish; Backspace removes a point; Esc cancels.',
  arrow: 'Click to add points along the route, then press Enter or double-click to finish. Backspace removes a point; Esc cancels.',
  text: 'Click where the text should go.',
  marker: 'Click where the marker should go.',
};
let setCursor = () => {},
  closePicker = () => {};
/** Wiring from main.js: cursor control and the picker's close function. */
export function configureEditing(opts) {
  setCursor = opts.setCursor;
  closePicker = opts.closePicker;
}

export function select(i) {
  app.sel = i;
  if (i < 0) setCursor(false);
  emit('objects');
  if (i >= 0) emit('selected');
  redraw();
}
/** Start drawing a new object of type t; pressing the same tool again cancels. */
export function startDraw(t) {
  if (!app.ready) return;
  if (app.pick) closePicker();
  if (app.drawing) {
    const same = app.drawing.t === t;
    cancelDraw();
    if (same) return;
  }
  select(-1);
  app.drawing = { pts: [], col: app.active, t };
  setCursor(true);
  emit('objects');
  redraw();
  note(HELP[t]);
}
export function cancelDraw() {
  app.drawing = null;
  setCursor(false);
  emit('objects');
  redraw();
  note('');
}
/** A click while drawing: add a point, or finish (click on the last point, or on the first point of a region). */
export function addPoint(x, y) {
  const g = geoAt(x, y);
  if (!g) return;
  const d = app.drawing,
    P = d.pts;
  setProj();
  if (d.t === 'text' || d.t === 'marker') {
    P.push(g);
    finishDraw();
    return;
  }
  const near = (q, px) => {
    const a = proj(q);
    return Math.hypot(a[0] - x, a[1] - y) < px;
  };
  if (P.length && near(P[P.length - 1], 7)) {
    finishDraw();
    return;
  }
  if (d.t === 'region' && P.length > 2 && onFront(P[0]) && near(P[0], 10)) {
    finishDraw();
    return;
  }
  P.push(g);
  redraw();
}
export function finishDraw() {
  const d = app.drawing;
  if (!d) return;
  const need = d.t === 'region' ? 3 : d.t === 'arrow' ? 2 : 1;
  if (d.pts.length < need) {
    note(d.t === 'region' ? 'A region needs at least 3 points.' : 'An arrow needs at least 2 points.', 1);
    return;
  }
  const o = newObj(d.t, d.pts, d.t === 'text' ? '#1b2430' : d.col);
  if (d.t === 'text') o.label = 'Label';
  app.objects.push(o);
  app.drawing = null;
  setCursor(false);
  select(app.objects.length - 1);
  commit();
  note(
    d.t === 'region' || d.t === 'arrow'
      ? 'Added. Drag its points to adjust, drag a small dot to add a point, Alt-click or right-click a point to remove it.'
      : 'Added. Drag it to move it; type its text in the list.',
  );
  const inp = document.querySelector('#rgl .rg-row.on input[type=text]');
  if (inp) {
    inp.focus();
    inp.select();
  }
}
/** Add an exact outline (merged countries or subdivisions) with the active colour. */
export function addShape(ref, label) {
  if (app.drawing) cancelDraw();
  app.objects.push(newObj('shape', [], app.active, { op: 0.35, ref, label }));
  select(-1);
  commit();
}
/** Exact outline of every country painted in the active colour. */
export function shapeFromPainted() {
  if (!app.ready) return;
  const names = [];
  app.fills.forEach((c, n) => {
    if (c === app.active) names.push(n);
  });
  if (!names.length) {
    note('Paint some countries in the current color first, then press this again.', 1);
    return;
  }
  addShape({ k: 'c', names: names.sort() }, names.length === 1 ? names[0] : '');
  note('Exact outline made from ' + names.length + ' countr' + (names.length === 1 ? 'y' : 'ies') + '.');
}
export function deleteObject(i) {
  app.objects.splice(i, 1);
  if (app.sel === i) app.sel = -1;
  else if (app.sel > i) app.sel--;
  emit('objects');
  redraw();
  commit();
}
export function moveObject(i, d) {
  const j = i + d,
    O = app.objects;
  [O[i], O[j]] = [O[j], O[i]];
  if (app.sel === i) app.sel = j;
  else if (app.sel === j) app.sel = i;
  emit('objects');
  redraw();
  commit();
}
