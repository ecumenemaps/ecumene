// Subdivision picker: choose a country, then select subdivisions by group, list or map click,
// and turn them into one exact outline.
import { geoBounds, geoCentroid, geoArea, geoContains } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import { app, redraw } from './store.js';
import { geo } from './data.js';
import { loadSubdivisions } from './objects.js';
import { addShape, cancelDraw, select } from './editing.js';
import { geoAt, setZoom, animate, centreOn } from './view.js';
import { $, el, note, clamp } from './util.js';
import Ecu from '../groups.js';

const GROUP_NAMES = { g: 'Constituent part', r: 'Region' };
let setCursor = () => {},
  refreshTip = () => {};
export function configurePicker(opts) {
  setCursor = opts.setCursor;
  refreshTip = opts.refreshTip;
}

export function openPicker() {
  if (!app.ready) return;
  if (app.drawing) cancelDraw();
  select(-1);
  app.pick = { sel: new Set() };
  $('a1p').hidden = false;
  $('a1o').hidden = true;
  $('a1c').value = '';
  $('a1f').value = '';
  render();
  $('a1c').focus();
  note('Choose a country, or click one on the globe. Then click subdivisions on the map or tick them in the list.');
}
export function closePicker() {
  app.pick = null;
  $('a1p').hidden = true;
  $('a1o').hidden = false;
  setCursor(false);
  refreshTip();
  redraw();
}
export async function pickCountry(c) {
  if (!geo.a1index[c]) {
    note(c + ' has no subdivisions in the data.', 1);
    return;
  }
  if (app.pick && app.pick.c === c && app.pick.feats) {
    $('a1c').value = c;
    return;
  }
  $('a1c').value = c;
  $('a1s').textContent = 'Loading ' + c + '…';
  try {
    const t = await loadSubdivisions(c);
    if (!app.pick) return;
    const feats = feature(t, t.objects.u).features;
    feats.forEach((f) => (f.bb = geoBounds(f)));
    app.pick = { c, topo: t, feats, mesh: mesh(t, t.objects.u), sel: new Set(), hov: null };
    setCursor(true);
    // frame the country: zoom so its rough angular radius fills about half the view
    const area = feats.reduce((a, f) => a + Math.min(geoArea(f), 0.5), 0),
      th = clamp(Math.sqrt(area / Math.PI), 0.02, 1.3);
    setZoom(clamp(0.55 / Math.sin(th), 1, 20));
    animate(centreOn(geoCentroid({ type: 'FeatureCollection', features: feats })));
    render();
    redraw();
    note('');
  } catch (e) {
    $('a1s').textContent = '';
    note('Could not load the subdivisions for ' + c + '. If you opened the file directly, serve it through a web server (see README).', 1);
  }
}
function inBounds(f, g) {
  const b = f.bb;
  if (g[1] < b[0][1] - 0.01 || g[1] > b[1][1] + 0.01) return false;
  const x0 = b[0][0],
    x1 = b[1][0];
  return x0 <= x1 ? g[0] >= x0 - 0.01 && g[0] <= x1 + 0.01 : g[0] >= x0 - 0.01 || g[0] <= x1 + 0.01;
}
/** Subdivision feature under a canvas pixel, or null. */
export function unitAt(x, y) {
  const pk = app.pick;
  if (!pk || !pk.feats) return null;
  const g = geoAt(x, y);
  return g ? pk.feats.find((f) => inBounds(f, g) && geoContains(f, g)) || null : null;
}
export function toggleUnits(ids, on) {
  ids.forEach((id) => (on ? app.pick.sel.add(id) : app.pick.sel.delete(id)));
  render();
  redraw();
}
function render() {
  const gb = $('a1g'),
    lb = $('a1l'),
    pk = app.pick;
  gb.textContent = '';
  lb.textContent = '';
  if (!pk || !pk.feats) {
    $('a1s').textContent = '';
    $('a1ok').disabled = true;
    return;
  }
  for (const k of Object.keys(geo.a1index[pk.c].gr || {})) {
    const vals = [...new Set(pk.feats.map((f) => f.properties[k]).filter(Boolean))].sort();
    gb.append(el('div', { class: 'a1h', textContent: GROUP_NAMES[k] + ':' }));
    for (const v of vals) {
      const ids = pk.feats.filter((f) => f.properties[k] === v).map((f) => f.id),
        all = ids.every((id) => pk.sel.has(id));
      gb.append(
        el('button', {
          type: 'button',
          class: 'chip' + (all ? ' on' : ''),
          textContent: v + ' (' + ids.length + ')',
          onclick: () => toggleUnits(ids, !all),
        }),
      );
    }
  }
  const q = Ecu.norm($('a1f').value || '');
  pk.feats
    .slice()
    .sort((a, b) => a.properties.n.localeCompare(b.properties.n))
    .forEach((f) => {
      const p = f.properties;
      if (q && !Ecu.norm(p.n + ' ' + p.r + ' ' + p.g).includes(q)) return;
      const cb = el('input', { type: 'checkbox', checked: pk.sel.has(f.id), onchange: () => toggleUnits([f.id], cb.checked) });
      lb.append(el('label', null, cb, ' ' + p.n + ' ', el('small', { textContent: [p.ty, p.g || p.r].filter(Boolean).join(' · ') })));
    });
  $('a1s').textContent = pk.sel.size + ' of ' + pk.feats.length + ' selected';
  $('a1ok').disabled = !pk.sel.size;
}
/** A sensible default name: the unit's name, or the group name if the selection is exactly one group. */
function defaultLabel() {
  const pk = app.pick,
    ids = [...pk.sel],
    byId = (id) => pk.feats.find((f) => f.id === id).properties;
  if (ids.length === 1) return byId(ids[0]).n;
  for (const k of ['g', 'r']) {
    const vals = new Set(ids.map((id) => byId(id)[k]));
    if (vals.size === 1) {
      const v = [...vals][0];
      if (v && pk.feats.filter((f) => f.properties[k] === v).length === ids.length) return v;
    }
  }
  return '';
}
export function initPicker() {
  $('a1o').onclick = openPicker;
  $('a1x').onclick = () => {
    closePicker();
    note('');
  };
  $('a1ok').onclick = () => {
    const pk = app.pick;
    if (!pk || !pk.sel.size) return;
    const ref = { k: 'a1', c: pk.c, ids: [...pk.sel].sort((a, b) => a - b) },
      label = defaultLabel();
    closePicker();
    addShape(ref, label);
    note('Exact outline added' + (label ? ': ' + label : '') + '.');
  };
  $('a1all').onclick = () => {
    if (app.pick && app.pick.feats)
      toggleUnits(
        app.pick.feats.map((f) => f.id),
        true,
      );
  };
  $('a1none').onclick = () => {
    if (app.pick && app.pick.feats) toggleUnits([...app.pick.sel], false);
  };
  const countries = Object.keys(geo.a1index),
    match = Ecu.matcher(countries);
  $('a1c').addEventListener('change', () => {
    const v = $('a1c').value,
      c = match(v);
    if (c) pickCountry(c);
    else if (v.trim()) note('No subdivisions found for "' + v + '".', 1);
  });
  $('a1f').oninput = render;
  $('a1names').replaceChildren(...countries.sort().map((n) => el('option', { value: n })));
}
