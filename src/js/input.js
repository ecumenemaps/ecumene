// Pointer, wheel and keyboard handling on the globe, plus the hover name tag.
import { geoInterpolate } from 'd3-geo';
import { app, redraw } from './store.js';
import { nameOf } from './data.js';
import { Rb, geoAt, idAtPx, setZoom, animate } from './view.js';
import { setFill, toggleFill } from './paint.js';
import { commit, commitSoon, undo, redo } from './history.js';
import { objectAt, handleAt, minPts } from './objects.js';
import { addPoint, finishDraw, cancelDraw, select } from './editing.js';
import { closePicker, pickCountry, unitAt, toggleUnits } from './picker.js';
import { HOME, emit } from './store.js';
import { $, note } from './util.js';

let cv, tip, onHoverChanged;
const paintMode = () => $('pm').checked;
/** Crosshair while painting or drawing; `on` forces it, otherwise it follows the touch paint toggle. */
export const setCursor = (on) => (cv.style.cursor = on || paintMode() ? 'crosshair' : '');

function track(e) {
  const r = cv.getBoundingClientRect();
  app.mx = e.clientX - r.left;
  app.my = e.clientY - r.top;
}
function placeTip() {
  if (tip.hidden) return;
  const w = tip.offsetWidth,
    h = tip.offsetHeight;
  let x = app.mx + 14,
    y = app.my + 18;
  if (x + w > app.W - 4) x = app.mx - w - 10;
  if (y + h > app.H - 4) y = app.my - h - 10;
  tip.style.transform = 'translate(' + Math.max(2, x) + 'px,' + Math.max(2, y) + 'px)';
}
/** Update the name tag: subdivision (when picking), else named region, else country. */
export function refreshTip() {
  const pk = app.pick,
    o = app.objects[app.hoverObj];
  const name = (pk && pk.hov ? pk.hov.properties.n : o ? o.label.trim() : '') || (app.hover ? nameOf(app.hover) : '');
  $('sr').textContent = name;
  if (app.hoverStyle.tip && name) {
    tip.textContent = name;
    tip.hidden = false;
    placeTip();
  } else tip.hidden = true;
}
function setHover(id) {
  if (id === app.hover) return;
  app.hover = id;
  refreshTip();
  onHoverChanged();
  redraw();
}

// Ctrl/Cmd-drag (or the touch toggle) paints every country the pointer crosses, interpolating fast moves.
let last = null;
function paintAt(x, y) {
  const a = last || [x, y],
    n = Math.max(1, Math.min(40, Math.ceil(Math.hypot(x - a[0], y - a[1]) / 3)));
  let changed = false;
  for (let s = 1; s <= n; s++) {
    const id = idAtPx(a[0] + ((x - a[0]) * s) / n, a[1] + ((y - a[1]) * s) / n);
    if (id) {
      const nm = nameOf(id);
      if (app.fills.get(nm) !== app.active) {
        setFill(nm, app.active);
        changed = true;
      }
    }
  }
  last = [x, y];
  app.mx = x;
  app.my = y;
  const id = idAtPx(x, y);
  if (id !== app.hover) {
    app.hover = id;
    onHoverChanged();
  }
  refreshTip();
  if (changed) {
    emit('legend');
    commitSoon();
  }
  redraw();
}
const wantsPaint = (e) => !app.drawing && app.sel < 0 && !app.pick && (e.ctrlKey || e.metaKey || paintMode());

export function initInput(canvas, opts) {
  cv = canvas;
  tip = $('tip');
  onHoverChanged = opts.onHoverChanged;
  const pointers = new Map();
  let moved = 0,
    pinched = false,
    pinchDist = 0,
    touchTimer = 0;
  const spread = () => {
    const a = [...pointers.values()];
    return Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]);
  };

  addEventListener('keydown', (e) => {
    if (e.key === 'Control' || e.key === 'Meta') setCursor(true);
  });
  addEventListener('keyup', (e) => {
    if (e.key === 'Control' || e.key === 'Meta') {
      last = null;
      setCursor(false);
    }
  });
  addEventListener('blur', () => setCursor(false));
  $('pm').onchange = () => setCursor(false);
  cv.addEventListener('contextmenu', (e) => {
    if (e.ctrlKey || app.sel >= 0 || app.drawing) e.preventDefault();
  });

  cv.addEventListener('pointerdown', (e) => {
    if (!app.ready) return;
    track(e);
    cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 1) {
      moved = 0;
      pinched = false;
      if (app.sel >= 0 && !app.drawing) {
        const h = handleAt(app.mx, app.my);
        if (h) {
          const r = app.objects[app.sel];
          if (h.v !== undefined && (e.button === 2 || e.altKey)) {
            if (r.pts.length > minPts(r) && minPts(r) > 1) {
              r.pts.splice(h.v, 1);
              emit('objects');
              redraw();
              commit();
            } else note('That point cannot be removed.', 1);
            moved = 99;
            return;
          }
          if (h.m !== undefined) {
            r.pts.splice(h.m + 1, 0, geoInterpolate(r.pts[h.m], r.pts[(h.m + 1) % r.pts.length])(0.5));
            app.drag = h.m + 1;
          } else app.drag = h.v;
          moved = 99;
          redraw();
          return;
        }
      }
      if (wantsPaint(e)) {
        last = null;
        paintAt(app.mx, app.my);
        moved = 99;
      }
    }
    if (pointers.size === 2) {
      pinched = true;
      pinchDist = spread();
    }
  });

  cv.addEventListener('pointermove', (e) => {
    if (!app.ready) return;
    if (!pointers.has(e.pointerId)) {
      if (e.pointerType !== 'mouse') return;
      track(e);
      const pk = app.pick;
      if (pk && pk.feats) {
        const u = unitAt(app.mx, app.my);
        if (u !== pk.hov) {
          pk.hov = u;
          setHover(0);
          refreshTip();
          redraw();
        }
        placeTip();
      } else if (app.drawing || app.sel >= 0) {
        setHover(0);
        redraw();
      } else if (e.ctrlKey || e.metaKey) paintAt(app.mx, app.my);
      else {
        const o = objectAt(app.mx, app.my);
        if (o !== app.hoverObj) {
          app.hoverObj = o;
          refreshTip();
        }
        setHover(idAtPx(app.mx, app.my));
        placeTip();
      }
      return;
    }
    const p = pointers.get(e.pointerId),
      dx = e.clientX - p[0],
      dy = e.clientY - p[1];
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) {
      const n = spread();
      if (pinchDist) setZoom((app.zoom * n) / pinchDist);
      pinchDist = n;
      return;
    }
    if (app.drag !== null) {
      track(e);
      const g = geoAt(app.mx, app.my);
      if (g) {
        app.objects[app.sel].pts[app.drag] = g;
        redraw();
      }
      return;
    }
    if (wantsPaint(e)) {
      track(e);
      paintAt(app.mx, app.my);
      return;
    }
    if (app.hover) setHover(0);
    moved += Math.abs(dx) + Math.abs(dy);
    const k = 57.3 / Rb();
    app.rot = [app.rot[0] + dx * k, Math.max(-90, Math.min(90, app.rot[1] - dy * k))];
    redraw();
  });

  const up = (e) => {
    last = null;
    if (!pointers.has(e.pointerId)) return;
    const one = pointers.size === 1;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    if (app.drag !== null) {
      app.drag = null;
      commit();
      redraw();
      return;
    }
    const click = one && !pinched && moved < 6 && e.type === 'pointerup';
    if (click) {
      track(e);
      if (app.pick) {
        if (app.pick.feats) {
          const u = unitAt(app.mx, app.my);
          if (u) toggleUnits([u.id], !app.pick.sel.has(u.id));
        } else {
          const id = idAtPx(app.mx, app.my);
          if (id) pickCountry(nameOf(id));
        }
        return;
      }
      if (app.drawing) {
        addPoint(app.mx, app.my);
        return;
      }
      if (app.sel >= 0) {
        const i = objectAt(app.mx, app.my);
        if (i !== app.sel) select(i);
        return;
      }
      const id = idAtPx(app.mx, app.my);
      if (id) toggleFill(nameOf(id));
    }
    if (app.drawing || app.sel >= 0 || app.pick) return;
    if (one && e.type === 'pointerup') {
      track(e);
      setHover(idAtPx(app.mx, app.my));
      placeTip();
      if (e.pointerType !== 'mouse') {
        clearTimeout(touchTimer);
        touchTimer = setTimeout(() => setHover(0), 1800);
      }
    }
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') {
      app.hoverObj = -1;
      setHover(0);
      refreshTip();
    }
  });
  cv.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      track(e);
      setZoom(app.zoom * Math.exp(-e.deltaY * 0.0015));
      setHover(idAtPx(app.mx, app.my));
      placeTip();
    },
    { passive: false },
  );
  $('zi').onclick = () => setZoom(app.zoom * 1.4);
  $('zo').onclick = () => setZoom(app.zoom / 1.4);
  $('rv').onclick = () => {
    app.zoom = 1;
    animate(HOME);
  };

  addEventListener('keydown', (e) => {
    const t = e.target && e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
    if (app.drawing) {
      if (e.key === 'Enter') {
        e.preventDefault();
        finishDraw();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelDraw();
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        app.drawing.pts.pop();
        redraw();
        return;
      }
    } else if (app.pick && e.key === 'Escape') {
      closePicker();
      note('');
      return;
    } else if (app.sel >= 0 && e.key === 'Escape') {
      select(-1);
      return;
    }
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'z') {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
    } else if (k === 'y') {
      e.preventDefault();
      redo();
    }
  });
}
