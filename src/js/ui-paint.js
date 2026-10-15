// Panel: paint colour, find a country, fill from a list or group, colour by data.
import { geoCentroid } from 'd3-geo';
import { SCALES, PAINT_SETS, safetyNote, classColors, divergingBreaks } from './schemes.js';
import { classBreaks, classIndex, classLabels } from './classes.js';
import { PATTERNS, PATTERN_TYPES, patternPaint, parsePaint, previewURL } from './patterns.js';
import { app, on, emit, redraw } from './store.js';
import { geo } from './data.js';
import { setFill, paintMany } from './paint.js';
import { commit } from './history.js';
import { animate, centreOn } from './view.js';
import { DETAIL, clearUnits, layersOf, activeLayer, setLayer, setDate } from './units.js';
import { fmtDay, isoDay, parseDay, yearDay, clampDay } from './dated.js';
import { refreshSub } from './input.js';
import { initStats, statChosen, colourStat } from './ui-stats.js';
import { initImport, colourImport } from './ui-import.js';
import { initElections } from './ui-elections.js';
import { $, el, note } from './util.js';
import Ecu from '../groups.js';

const listOf = (items, n) => items.slice(0, n).join(', ') + (items.length > n ? ' and ' + (items.length - n) + ' more' : '');

function initPalette() {
  const box = $('pal'),
    set = $('pset'),
    pbox = $('ptn'),
    ink = $('pink');
  const custom = el('input', { type: 'color', id: 'cc', value: app.solid, title: 'Custom color', aria: { label: 'Custom color' } });
  const mark = () => {
    for (const b of [...box.querySelectorAll('.sw'), ...pbox.querySelectorAll('.sw')]) b.classList.toggle('on', b.dataset.c === app.active);
  };
  // a plain color is painted with as is and becomes the background of the patterns
  const pickSolid = (col) => {
    app.active = app.solid = col;
    custom.value = col;
    patterns();
  };
  // the pattern buttons show each pattern on the current plain color, in the pattern color
  const patterns = () => {
    pbox.replaceChildren(
      ...PATTERN_TYPES.map((t) => {
        const v = patternPaint(t, app.solid, app.ink),
          b = el('button', {
            class: 'sw',
            title: PATTERNS[t].name,
            aria: { label: 'Paint with ' + PATTERNS[t].name.toLowerCase() },
            onclick: () => {
              app.active = v;
              mark();
            },
          });
        b.dataset.c = v;
        b.style.backgroundImage = 'url(' + previewURL(v) + ')';
        b.style.backgroundSize = PATTERNS[t].T + 'px';
        return b;
      }),
    );
    mark();
  };
  set.replaceChildren(...Object.keys(PAINT_SETS).map((k) => el('option', { value: k, textContent: k === 'Default' ? 'Default colors' : k })));
  // the swatches of the chosen set, then the custom color
  const fill = () => {
    if (!PAINT_SETS[app.paintSet]) app.paintSet = 'Default';
    set.value = app.paintSet;
    const S = PAINT_SETS[app.paintSet];
    box.replaceChildren(
      ...S.c.map((col) => {
        const b = el('button', { class: 'sw', aria: { label: 'Paint with ' + col }, onclick: () => pickSolid(col) });
        b.dataset.c = col;
        b.style.background = col;
        return b;
      }),
      custom,
    );
    $('psetn').textContent = safetyNote(S);
    patterns();
  };
  set.onchange = () => {
    app.paintSet = set.value;
    fill();
  };
  custom.oninput = () => pickSolid(custom.value);
  ink.oninput = () => {
    app.ink = ink.value;
    // a pattern in use switches to the new pattern color
    const p = parsePaint(app.active);
    if (p) app.active = patternPaint(p.type, p.bg, app.ink);
    patterns();
  };
  fill();
  on('palette', () => {
    const p = parsePaint(app.active);
    app.solid = p ? p.bg : app.active;
    custom.value = app.solid;
    patterns();
  });
  on('style', fill);
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
    if (clearUnits(nm) || app.fills.get(nm) !== app.active) {
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
  const showNote = () => ($('grpn').textContent = Ecu.groupNote(grp.value));
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
  const group = (kind, label) =>
    el('optgroup', { label }, ...Object.keys(SCALES).filter((k) => SCALES[k].kind === kind).map((k) => el('option', { value: k, textContent: k })));
  $('dpal').replaceChildren(group('seq', 'Low to high'), group('div', 'Either side of a centre'));
  $('dn').replaceChildren(...[2, 3, 4, 5, 6, 7, 8, 9].map((n) => el('option', { value: n, textContent: n + ' classes' })));
  const D = app.data;
  // the controls show and edit app.data, which is saved with the map
  const sync = () => {
    if (!SCALES[D.scale]) D.scale = 'Blues';
    const div = SCALES[D.scale].kind === 'div';
    $('dpal').value = D.scale;
    $('dn').value = String(D.n);
    $('dm').value = D.m;
    $('dc').value = D.c;
    $('drev').checked = !!D.rev;
    $('dcw').hidden = !div;
    // a diverging scale uses equal steps either side of its centre
    $('dm').disabled = div;
    $('dpaln').textContent = safetyNote(SCALES[D.scale]);
  };
  $('dpal').onchange = () => ((D.scale = $('dpal').value), sync());
  $('dn').onchange = () => (D.n = +$('dn').value);
  $('dm').onchange = () => (D.m = $('dm').value);
  $('dc').onchange = () => (D.c = $('dc').value.trim());
  $('drev').onchange = () => (D.rev = $('drev').checked);
  sync();
  on('style', sync);
  initStats(colourRows);
  initImport(colourRows);
  $('dgo').onclick = () => {
    if (!app.ready) return;
    // a statistic chosen above wins over pasted rows
    if (statChosen()) return colourStat();
    colourImport();
  };
}

/**
 * Class rows ({value, ...}) with the Data panel's scale, number of classes and method; set(row, color) applies
 * each color. Puts the classes in the legend, with their ranges as labels. Returns the number of classes used.
 */
export function colourRows(rows, set) {
  const D = app.data,
    vals = rows.map((x) => x.value),
    div = SCALES[D.scale].kind === 'div';
  let b, labels;
  if (div) {
    // centre: the value given, else 0 when the data has both signs, else the average
    const lo = Math.min(...vals),
      hi = Math.max(...vals),
      c = D.c !== '' && Number.isFinite(+D.c) ? +D.c : lo < 0 && hi > 0 ? 0 : vals.reduce((s, v) => s + v, 0) / vals.length;
    b = divergingBreaks(vals, Math.max(2, D.n), c);
    if (b.length < 2) b = [vals[0] - 1, vals[0]];
    labels = b.slice(0, -1).map((x, i) => Ecu.fmt(x) + ' to ' + Ecu.fmt(b[i + 1]));
  } else {
    // natural breaks, equal intervals or quantiles, with rounded edges (classes.js)
    const r = classBreaks(vals, D.n, D.m);
    b = r.b;
    labels = classLabels(b, r.int, Ecu.fmt);
  }
  const k = Math.max(1, b.length - 1),
    cols = classColors(D.scale, k, D.rev);
  const used = new Set();
  for (const x of rows) {
    const i = Math.min(k - 1, classIndex(x.value, b));
    used.add(i);
    set(x, cols[i]);
  }
  for (let i = 0; i < k; i++) app.labels[cols[i]] = labels[i] || Ecu.fmt(b[0]);
  app.legend.order = cols.filter((c, i) => used.has(i));
  return used.size;
}

function initSubdivisions() {
  const box = $('sub'),
    det = $('subd');
  det.replaceChildren(...Object.entries(DETAIL).map(([v, t]) => el('option', { value: v, textContent: t })));
  const sync = () => {
    box.checked = app.sub.on;
    det.value = app.sub.detail;
    det.disabled = !app.sub.on;
  };
  // the Election picker switches Subdivisions on
  on('style', sync);
  box.onchange = () => {
    app.sub.on = box.checked;
    sync();
    refreshSub();
    redraw();
  };
  det.onchange = () => {
    app.sub.detail = det.value;
    app.subHov = null;
    refreshSub();
  };
  sync();
  initLayerMenu();
}

// "Layer for <country>": shown for the last country pointed at in Subdivisions mode that offers several layers
function initLayerMenu() {
  const wrap = $('sublw'),
    sel = $('subl');
  const show = () => {
    const c = app.sub.country,
      L = c ? layersOf(c) : [];
    wrap.hidden = !app.sub.on || L.length < 2;
    if (wrap.hidden) return;
    $('subln').textContent = c;
    const y = activeLayer(c);
    sel.replaceChildren(...L.map((x) => el('option', { value: x.id, textContent: x.name, selected: x.id === y })));
    const x = L.find((l) => l.id === y);
    // a dated layer counts its versions, not the units on one day
    $('subls').textContent = x && x.credit ? (x.dated ? '' : x.n + ' units · ') + x.ed + '. ' + (x.note ? x.note + ' ' : '') + x.credit : '';
    showDate(x && x.dated);
  };
  sel.onchange = () => {
    const c = app.sub.country;
    if (c && !setLayer(c, sel.value, (m) => window.confirm(m))) return show();
    app.subHov = null;
    refreshSub();
    show();
  };
  on('subcountry', show);
  on('history', show);
  $('sub').addEventListener('change', show);
  initDate();
  show();
}

// The day a dated layer shows (#46): a slider by year (1 January, or the layer's first day in its first year), quick
// stops, and an exact day. The globe follows the slider as it moves; letting go makes one undo step.
let dated = null, // the dated layer's {from, to, stops} while its controls show
  stepFrom = 0; // the day of the last undo step, so the same day is never a step twice
function showDate(d) {
  dated = d || null;
  $('sdw').hidden = !dated;
  if (!dated) return;
  const day = clampDay(app.sub.date, dated.from, dated.to),
    y = $('sdy'),
    box = $('sdd');
  y.min = Math.floor(dated.from / 1e4);
  y.max = Math.floor(dated.to / 1e4);
  y.value = Math.floor(day / 1e4);
  box.min = isoDay(dated.from);
  box.max = isoDay(dated.to);
  box.value = isoDay(day);
  $('sdl').textContent = fmtDay(day);
  $('sds').replaceChildren(
    ...dated.stops.map((s) =>
      el('button', { type: 'button', class: 'chip' + (s === day ? ' on' : ''), textContent: String(Math.floor(s / 1e4)), title: fmtDay(s), onclick: () => goTo(s, true) }),
    ),
  );
}
function goTo(day, step) {
  if (!dated) return;
  setDate(clampDay(day, dated.from, dated.to));
  showDate(dated);
  if (step) stepDay();
}
// one undo step per day reached (the slider's input events move the globe; letting go makes the step)
function stepDay() {
  if (app.sub.date === stepFrom) return;
  stepFrom = app.sub.date;
  commit();
}
function initDate() {
  const y = $('sdy');
  stepFrom = app.sub.date;
  y.oninput = () => goTo(yearDay(+y.value, dated.from, dated.to), false);
  y.onchange = () => stepDay();
  $('sdd').onchange = () => {
    const n = parseDay($('sdd').value);
    if (n) goTo(n, true);
    else showDate(dated);
  };
  on('date', () => showDate(dated));
  // undo, redo and opening a map set the day without a new step
  on('history', () => (stepFrom = app.sub.date));
}

export function initPaintPanel() {
  const resolve = Ecu.matcher(geo.names);
  initPalette();
  initElections();
  initSubdivisions();
  initSearch();
  initLists(resolve);
  initData(resolve);
}
