// Undo/redo: snapshots of country fills, painted subdivisions and map objects (up to 200).
import { app, emit, redraw } from './store.js';
import { setFill } from './paint.js';

const LIMIT = 200;
// st/im: the statistic or the table of your own data the map is colored with, lt: the legend title that came with
// them (restored only when they change), lb: the legend labels (coloring by data replaces them), dt: the day dated
// layers show
const snap = () => ({ f: new Map(app.fills), u: new Map(app.units), o: JSON.stringify(app.objects), st: app.stat, im: app.imported, lt: app.legend.title, lb: { ...app.labels }, dt: app.sub.date });
let hist = [{ f: new Map(), u: new Map(), o: '[]', st: null, im: null, lt: '', lb: {}, dt: app.sub.date }],
  hix = 0,
  timer = 0;

export const canUndo = () => hix > 0;
export const canRedo = () => hix < hist.length - 1;
/** Record the current state as a new undo step. */
export function commit() {
  clearTimeout(timer);
  timer = 0;
  hist.length = hix + 1;
  hist.push(snap());
  if (hist.length > LIMIT) hist.shift();
  hix = hist.length - 1;
  emit('history');
}
/** Commit after a pause, so a paint stroke becomes one undo step. */
export function commitSoon() {
  clearTimeout(timer);
  timer = setTimeout(commit, 400);
}
function restore(s) {
  app.objects.splice(0, app.objects.length, ...JSON.parse(s.o));
  if (app.sel >= app.objects.length) app.sel = -1;
  app.drawing = null;
  [...app.fills.keys()].forEach((n) => {
    if (!s.f.has(n)) setFill(n, null);
  });
  s.f.forEach((c, n) => {
    if (app.fills.get(n) !== c) setFill(n, c);
  });
  app.units.clear();
  s.u.forEach((c, k) => app.units.set(k, c));
  if (app.sub.date !== s.dt) {
    app.sub.date = s.dt;
    emit('date');
  }
  if (app.stat !== s.st || app.imported !== s.im) {
    // coloring by data replaced the legend labels; renamed labels otherwise stay as they are
    for (const k in app.labels) delete app.labels[k];
    Object.assign(app.labels, s.lb);
    app.stat = s.st;
    app.imported = s.im;
    app.legend.title = s.lt;
    emit('stat');
    emit('import');
  }
  emit('objects');
  emit('legend');
  emit('history');
  redraw();
}
export function undo() {
  if (timer) commit();
  if (hix > 0) restore(hist[--hix]);
}
export function redo() {
  if (timer) commit();
  if (hix < hist.length - 1) restore(hist[++hix]);
}
