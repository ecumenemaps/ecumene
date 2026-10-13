// Panel: paint colour, find a country, fill from a list or group, colour by data.
import {
  interpolateBlues,
  interpolateGreens,
  interpolateOranges,
  interpolatePurples,
  interpolateReds,
  interpolateViridis,
  interpolateYlOrRd,
  interpolateYlGnBu,
} from 'd3-scale-chromatic';
import { color } from 'd3-color';
import { geoCentroid } from 'd3-geo';
import { app, on, emit, redraw } from './store.js';
import { geo } from './data.js';
import { setFill, paintMany } from './paint.js';
import { commit } from './history.js';
import { animate, centreOn } from './view.js';
import { $, el, note } from './util.js';
import Ecu from '../groups.js';

export const COLORS = ['#e4572e', '#f2a541', '#f6d743', '#7cc06b', '#2a9d8f', '#3d8bd9', '#5b5fc7', '#a05cc7', '#d6539f', '#7a6a5b'];
const SCALES = {
  Blues: interpolateBlues,
  Greens: interpolateGreens,
  Oranges: interpolateOranges,
  Purples: interpolatePurples,
  Reds: interpolateReds,
  Viridis: interpolateViridis,
  'Yellow-Orange-Red': interpolateYlOrRd,
  'Yellow-Green-Blue': interpolateYlGnBu,
};
const listOf = (items, n) => items.slice(0, n).join(', ') + (items.length > n ? ' and ' + (items.length - n) + ' more' : '');

function initPalette() {
  const box = $('pal');
  const custom = el('input', { type: 'color', id: 'cc', value: app.active, title: 'Custom color', aria: { label: 'Custom color' } });
  const mark = () => box.querySelectorAll('.sw').forEach((b) => b.classList.toggle('on', b.dataset.c === app.active));
  for (const col of COLORS) {
    const b = el('button', {
      class: 'sw',
      aria: { label: 'Paint with ' + col },
      onclick: () => {
        app.active = col;
        custom.value = col;
        mark();
      },
    });
    b.dataset.c = col;
    b.style.background = col;
    box.append(b);
  }
  custom.oninput = () => {
    app.active = custom.value;
    mark();
  };
  box.append(custom);
  mark();
  on('palette', () => {
    custom.value = app.active;
    mark();
  });
}

function initSearch() {
  $('names').replaceChildren(...geo.names.map((n) => el('option', { value: n })));
  const find = (s) => {
    s = s.trim().toLowerCase();
    const F = geo.feats,
      nm = (f) => f.properties.name.toLowerCase();
    let i = F.findIndex((f) => nm(f) === s);
    if (i < 0) i = F.findIndex((f) => nm(f).startsWith(s));
    if (i < 0) i = F.findIndex((f) => nm(f).includes(s));
    return i;
  };
  const go = () => {
    const s = $('q').value;
    if (!s.trim() || !app.ready) return;
    const i = find(s);
    if (i < 0) {
      note('No country matches "' + s + '".');
      return;
    }
    note('');
    animate(centreOn(geoCentroid(geo.feats[i])));
    const nm = geo.feats[i].properties.name;
    if (app.fills.get(nm) !== app.active) {
      setFill(nm, app.active);
      emit('legend');
      commit();
    }
    $('q').value = '';
  };
  $('q').addEventListener('change', go);
  $('q').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') go();
  });
}

function initLists(resolve) {
  $('blp').onclick = () => {
    if (!app.ready) return;
    const r = Ecu.parseList($('bl').value, resolve);
    if (!r.found.length && !r.unknown.length) {
      note('Type or paste some country names first.', 1);
      return;
    }
    paintMany(r.found, app.active);
    let m = 'Painted ' + r.found.length + (r.found.length === 1 ? ' country' : ' countries');
    if (r.unknown.length) m += '. Not found: ' + listOf(r.unknown, 8) + '.';
    note(m, !r.found.length && r.unknown.length > 0);
  };
  const grp = $('grp'),
    opts = (keys) => keys.map((k) => el('option', { textContent: k }));
  grp.replaceChildren(
    el('optgroup', { label: 'Groups' }, ...opts(Object.keys(Ecu.GROUPS).filter((k) => !Ecu.CONTINENTS[k]))),
    el('optgroup', { label: 'Continents' }, ...opts(Object.keys(Ecu.CONTINENTS))),
  );
  const showNote = () => ($('grpn').textContent = Ecu.GROUP_NOTES[grp.value] || '');
  grp.onchange = showNote;
  showNote();
  $('grpp').onclick = () => {
    if (!app.ready) return;
    const g = Ecu.GROUPS[grp.value] || [];
    paintMany(g, app.active);
    note(grp.value + ': ' + g.length + ' areas painted.');
  };
}

function initData(resolve) {
  $('dpal').replaceChildren(...Object.keys(SCALES).map((k) => el('option', { textContent: k })));
  $('dn').replaceChildren(...[3, 4, 5, 6, 7, 8, 9].map((n) => el('option', { value: n, textContent: n + ' classes', selected: n === 5 })));
  $('dgo').onclick = () => {
    if (!app.ready) return;
    const r = Ecu.parseData($('dd').value, resolve);
    if (!r.rows.length) {
      note(r.bad.length ? 'Could not read "' + r.bad[0] + '". Use: country, value' : 'Paste some rows first (country, value).', 1);
      return;
    }
    const vals = r.rows.map((x) => x.value);
    let b = Ecu.breaks(vals, +$('dn').value, $('dm').value);
    if (b.length < 2) b = [vals[0] - 1, vals[0]];
    const k = b.length - 1,
      f = SCALES[$('dpal').value],
      cols = [];
    // avoid the near-white end of the scale so the lightest class is still visible on land
    for (let i = 0; i < k; i++) cols.push(color(f(k === 1 ? 0.6 : 0.15 + (0.8 * i) / (k - 1))).formatHex());
    const used = new Set();
    for (const x of r.rows) {
      const i = Ecu.classOf(x.value, b);
      used.add(i);
      setFill(x.name, cols[i]);
    }
    for (let i = 0; i < k; i++) app.labels[cols[i]] = Ecu.fmt(b[i]) + ' to ' + Ecu.fmt(b[i + 1]);
    app.legend.order = cols.filter((c, i) => used.has(i));
    emit('legend');
    redraw();
    commit();
    let m = r.rows.length + ' countries colored in ' + used.size + ' classes.';
    if (r.unknown.length) m += ' Not found: ' + listOf(r.unknown, 6) + '.';
    if (r.bad.length) m += ' Skipped ' + r.bad.length + ' unreadable line' + (r.bad.length > 1 ? 's' : '') + '.';
    note(m, r.unknown.length > 0 || r.bad.length > 0);
  };
}

export function initPaintPanel() {
  const resolve = Ecu.matcher(geo.names);
  initPalette();
  initSearch();
  initLists(resolve);
  initData(resolve);
}
