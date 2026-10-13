// Ecumene: entry point. Sets up rendering, loads data, wires the panels and input.
import { mesh } from 'topojson-client';
import { app, setRenderer, redraw, emit, VERSION } from './store.js';
import { initGL, uploadTris, uploadPhys, setBorders, setHoverOutline, segs, render } from './gl.js';
import { geo, loadBase, nameOf } from './data.js';
import { Rb, tinyMarkers, setProj, proj } from './view.js';
import { loadUnits } from './units.js';
import { drawUnitHover, drawTinyMarkers, drawObjects, drawObjectLabels, drawCountryNames, drawLegend } from './overlay.js';
import { configureEditing } from './editing.js';
import { configurePicker, closePicker, initPicker } from './picker.js';
import { initInput, setCursor, refreshTip } from './input.js';
import { initPaintPanel } from './ui-paint.js';
import { initStylePanel } from './ui-style.js';
import { initLegendPanel } from './ui-legend.js';
import { initObjectsPanel } from './ui-objects.js';
import { initFilePanel } from './ui-file.js';
import { initModes, setMode } from './ui-modes.js';
import { setExportCanvas, buildSVG } from './export.js';
import { getState, setState, encode, decode, restoreAutosave, startAutosave } from './persist.js';
import { $, note } from './util.js';

const cv = $('cv'),
  ov = $('ov'),
  oc = ov.getContext('2d'),
  stage = $('stage');
// borders are drawn between differently named countries only, so merged enclaves have no inner line
const notSame = (a, b) => a === b || a.properties.name !== b.properties.name;

function frame() {
  render(Rb() * app.dpr);
  oc.setTransform(1, 0, 0, 1, 0, 0);
  oc.clearRect(0, 0, ov.width, ov.height);
  oc.setTransform(app.dpr, 0, 0, app.dpr, 0, 0);
  drawUnitHover(oc);
  drawTinyMarkers(oc, true);
  drawObjects(oc, true);
  if (app.layers.names) drawCountryNames(oc);
  drawObjectLabels(oc);
  // the legend is shown on the map too; its box is kept for dragging
  app.legendRect = drawLegend(oc, app.W, app.H);
}
function fit() {
  app.W = stage.clientWidth;
  app.H = stage.clientHeight;
  app.dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (const c of [cv, ov]) {
    c.width = Math.round(app.W * app.dpr);
    c.height = Math.round(app.H * app.dpr);
    c.style.width = app.W + 'px';
    c.style.height = app.H + 'px';
  }
  redraw();
}
// outline of the hovered country (only when that hover style is on)
let outlined = -1;
function updateHoverOutline(force) {
  if (force) outlined = -1;
  if (!app.hoverStyle.outline) {
    setHoverOutline(null);
    outlined = -1;
    return;
  }
  if (app.hover === outlined) return;
  outlined = app.hover;
  if (!app.hover) {
    setHoverOutline(null);
    return;
  }
  const nm = nameOf(app.hover),
    gs = geo.topo.objects.countries.geometries.filter((g) => g.properties && g.properties.name === nm);
  setHoverOutline(segs(mesh(geo.topo, { type: 'GeometryCollection', geometries: gs }, notSame).coordinates));
}

// Links from the home page: ?new, ?start=wikipedia|data|flat, ?example=<name>. Anything else
// continues the map saved in this browser.
async function applyStart() {
  const q = new URLSearchParams(location.search),
    start = q.get('start'),
    example = q.get('example');
  const fresh = q.has('new') || !!start || !!example;
  restoreAutosave(!fresh);
  if (fresh) history.replaceState(null, '', location.pathname);
  if (start === 'wikipedia') {
    $('pre').value = 'wikipedia';
    $('pre').dispatchEvent(new Event('change'));
    setMode('paint');
  } else if (start === 'data') {
    setMode('data');
    $('dd').focus();
    note('Paste one country and value per line, then choose Color the map.');
  } else if (start === 'flat') {
    Object.assign(app.exportOpts, { proj: 'equalearth', area: 'world', width: 0 });
    emit('export');
    setMode('paint');
    note('Paint on the globe. Exports come out as a flat Equal Earth world map; change the projection in Export.');
  } else if (example && /^[a-z0-9-]{1,40}$/.test(example)) {
    try {
      const r = await fetch('../examples/' + example + '.json');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const s = await r.json();
      setState(s);
      if (s.x && typeof s.x === 'object') {
        Object.assign(app.exportOpts, s.x);
        emit('export');
      }
      if (s.mode) setMode(s.mode);
      note('Example opened. Change anything you like; it saves in this browser like any map.');
    } catch (e) {
      note('Could not open that example (' + e.message + ').', 1);
    }
  } else if (fresh) setMode('paint');
}

async function main() {
  const err = initGL(cv);
  if (err) {
    $('load').hidden = true;
    $('st').textContent = err;
    return;
  }
  initModes();
  setRenderer(frame);
  setExportCanvas(cv);
  new ResizeObserver(fit).observe(stage);
  fit();
  const { tris, phys } = await loadBase();
  uploadTris(tris);
  setBorders(segs(mesh(geo.topo, geo.topo.objects.countries, notSame).coordinates));
  configureEditing({ setCursor, closePicker });
  configurePicker({ setCursor, refreshTip });
  initInput(cv, { onHoverChanged: updateHoverOutline });
  initStylePanel({ onHoverChange: () => updateHoverOutline(true), refreshTip });
  initPaintPanel();
  initLegendPanel();
  initObjectsPanel();
  initPicker();
  initFilePanel();
  emit('history');
  app.ready = true;
  $('load').hidden = true;
  await applyStart();
  startAutosave();
  redraw();
  phys.then(
    (p) => {
      geo.phys = p;
      uploadPhys(p);
      redraw();
    },
    (e) => console.warn('Lakes and rivers did not load:', e),
  );
  // small scripting API, also used by the tests
  window.ecumene = {
    version: VERSION,
    getState,
    setState,
    encode,
    decode,
    svg: buildSVG,
    mode: setMode,
    legendRect: () => app.legendRect,
    // small-country markers on screen, in canvas pixels
    markers: () => tinyMarkers().map((m) => ({ n: m.n, x: m.p[0], y: m.p[1] })),
    // canvas pixel of a [lon, lat] in the current view
    px: (g) => (setProj(), proj(g)),
    // load a country's subdivisions (as resting the pointer on it does); resolves when they can be painted
    loadUnits: (c) => loadUnits(c).then(() => true),
  };
}
main().catch((e) => {
  $('load').hidden = true;
  $('st').textContent = 'Setup failed: ' + e.message;
  console.error(e);
});
