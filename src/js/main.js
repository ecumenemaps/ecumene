// Ecumene: entry point. Sets up rendering, loads data, wires the panels and input.
import { mesh } from 'topojson-client';
import { app, setRenderer, redraw, emit } from './store.js';
import { initGL, uploadTris, uploadPhys, setBorders, setHoverOutline, segs, render } from './gl.js';
import { geo, loadBase, nameOf } from './data.js';
import { Rb } from './view.js';
import { drawObjects, drawObjectLabels, drawCountryNames } from './overlay.js';
import { configureEditing } from './editing.js';
import { configurePicker, closePicker, initPicker } from './picker.js';
import { initInput, setCursor, refreshTip } from './input.js';
import { initPaintPanel } from './ui-paint.js';
import { initStylePanel } from './ui-style.js';
import { initLegendPanel } from './ui-legend.js';
import { initObjectsPanel } from './ui-objects.js';
import { initFilePanel } from './ui-file.js';
import { setExportCanvas } from './export.js';
import { getState, setState, encode, decode, restoreAutosave, startAutosave } from './persist.js';
import { $ } from './util.js';

const VERSION = '0.2.0';
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
  drawObjects(oc, true);
  if (app.layers.names) drawCountryNames(oc);
  drawObjectLabels(oc);
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

async function main() {
  const err = initGL(cv);
  if (err) {
    $('load').hidden = true;
    $('st').textContent = err;
    return;
  }
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
  restoreAutosave();
  startAutosave();
  redraw();
  phys.then(
    (p) => {
      uploadPhys(p);
      redraw();
    },
    (e) => console.warn('Lakes and rivers did not load:', e),
  );
  // small scripting API, also used by the tests
  window.ecumene = { version: VERSION, getState, setState, encode, decode };
}
main().catch((e) => {
  $('load').hidden = true;
  $('st').textContent = 'Setup failed: ' + e.message;
  console.error(e);
});
