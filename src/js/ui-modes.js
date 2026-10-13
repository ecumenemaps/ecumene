// Panel modes: a rail of six tabs (a bottom bar on phones) that shows one group of controls at a time.
// Clicking the active tab hides the panel (desktop) or closes the sheet (phone) to give the map room.
import { app, on } from './store.js';

export const MODES = ['paint', 'data', 'draw', 'style', 'legend', 'export'];
const KEY = 'ecumeneMode';
let current = 'paint';
const phone = () => matchMedia('(max-width:720px)').matches;

function show(m) {
  current = m;
  document.querySelectorAll('#rail [data-mode]').forEach((b) => {
    const on = b.dataset.mode === m;
    b.classList.toggle('on', on && !document.body.classList.contains('collapsed'));
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  document.querySelectorAll('#panel .mode').forEach((d) => d.classList.toggle('on', d.dataset.mode === m));
  try {
    localStorage.setItem(KEY, m);
  } catch (_) {}
}
function setCollapsed(c) {
  document.body.classList.toggle('collapsed', c);
  show(current);
}

/** Switch to a mode and make sure the panel is open. toggle: a second click on the open mode hides it. */
export function setMode(m, toggle) {
  if (!MODES.includes(m)) return;
  const collapsed = document.body.classList.contains('collapsed');
  if (toggle && m === current && !collapsed) {
    setCollapsed(true);
    return;
  }
  if (collapsed) setCollapsed(false);
  show(m);
  const panel = document.getElementById('panel');
  if (panel) panel.scrollTop = 0;
}
export const currentMode = () => current;

export function initModes() {
  let saved = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch (_) {}
  show(MODES.includes(saved) ? saved : 'paint');
  document.querySelectorAll('#rail [data-mode]').forEach((b) => (b.onclick = () => setMode(b.dataset.mode, true)));
  // 1-6 switch modes when not typing
  addEventListener('keydown', (e) => {
    const t = e.target && e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
    const i = '123456'.indexOf(e.key);
    if (i >= 0 && e.key.length === 1) setMode(MODES[i]);
  });
  // selecting a region or annotation on the map brings up its controls
  on('selected', () => {
    if (app.sel >= 0 && current !== 'draw') setMode('draw');
  });
  // phone sheet: drag or tap the handle to switch between half and full height
  const grab = document.getElementById('grab');
  document.body.dataset.sheet = 'half';
  let y0 = null;
  grab.onpointerdown = (e) => {
    y0 = e.clientY;
    grab.setPointerCapture(e.pointerId);
  };
  grab.onpointerup = (e) => {
    if (y0 === null) return;
    const dy = e.clientY - y0,
      S = document.body.dataset;
    y0 = null;
    if (Math.abs(dy) < 8) S.sheet = S.sheet === 'full' ? 'half' : 'full';
    else if (dy < 0) S.sheet = 'full';
    else if (S.sheet === 'full') S.sheet = 'half';
    else setCollapsed(true);
  };
  if (phone()) document.body.dataset.sheet = 'half';
}
