// Panel: regions and annotations list (colour, text, styling, edit, order, delete).
import { app, on, redraw } from './store.js';
import { KIND, shapeReady } from './objects.js';
import { startDraw, finishDraw, cancelDraw, select, shapeFromPainted, deleteObject, moveObject } from './editing.js';
import { commit } from './history.js';
import { $, el } from './util.js';

const ICON = { region: '▭', shape: '◆', arrow: '→', text: 'T', marker: '●' };
const PLACEHOLDER = { text: 'Text', marker: 'Label (optional)' };

// small controls that edit one property of an object and record an undo step
const range = (label, min, max, step, val, set) => {
  const i = el('input', {
    type: 'range',
    min,
    max,
    step,
    value: val,
    aria: { label },
    oninput: () => {
      set(+i.value);
      redraw();
    },
    onchange: commit,
  });
  return el('label', null, label, i);
};
const check = (label, val, set) => {
  const i = el('input', {
    type: 'checkbox',
    checked: val,
    onchange: () => {
      set(i.checked);
      redraw();
      commit();
    },
  });
  return el('label', null, i, ' ' + label);
};
const choice = (label, opts, val, set) => {
  const i = el(
    'select',
    {
      aria: { label },
      onchange: () => {
        set(i.value);
        redraw();
        commit();
      },
    },
    ...opts.map(([v, n]) => el('option', { value: v, textContent: n, selected: v === val })),
  );
  return el('label', null, label, i);
};
const btn = (t, label, fn, disabled) =>
  el('button', { type: 'button', textContent: t, title: label, aria: { label }, disabled: !!disabled, onclick: fn });

function sourceText(r) {
  const f = r.ref;
  if (f.k === 'c')
    return f.names.length + ' countr' + (f.names.length === 1 ? 'y' : 'ies') + (f.names.length <= 4 ? ': ' + f.names.join(', ') : '');
  return f.c + ' · ' + f.ids.length + ' subdivision' + (f.ids.length === 1 ? '' : 's') + (shapeReady(r) ? '' : ' (loading)');
}
function options(r) {
  const t = r.t || 'region';
  if (t === 'region' || t === 'shape')
    return [
      range('Fill', 0, 1, 0.01, r.op, (v) => (r.op = v)),
      range('Outline', 0, 6, 0.2, r.lw, (v) => (r.lw = v)),
      check('Dashed', r.dash, (v) => (r.dash = v)),
      range('Name size', 9, 36, 1, r.fs, (v) => (r.fs = v)),
      check('Name on map', r.sn, (v) => (r.sn = v)),
    ];
  if (t === 'arrow')
    return [
      range('Width', 1, 12, 0.5, r.aw, (v) => (r.aw = v)),
      choice(
        'Head',
        [
          ['end', 'At end'],
          ['both', 'Both ends'],
          ['none', 'None'],
        ],
        r.head,
        (v) => (r.head = v),
      ),
      check('Dashed', r.dash, (v) => (r.dash = v)),
      check('Smooth curve', r.sm, (v) => (r.sm = v)),
    ];
  if (t === 'text')
    return [
      range('Size', 9, 48, 1, r.fs, (v) => (r.fs = v)),
      range('Rotation', -90, 90, 1, r.rot, (v) => (r.rot = v)),
      check('Italic', r.it, (v) => (r.it = v)),
    ];
  return [
    choice(
      'Symbol',
      [
        ['dot', 'Dot'],
        ['square', 'Square'],
        ['triangle', 'Triangle'],
        ['star', 'Star'],
      ],
      r.sym,
      (v) => (r.sym = v),
    ),
    range('Size', 2, 16, 0.5, r.ms, (v) => (r.ms = v)),
    range('Text size', 9, 32, 1, r.fs, (v) => (r.fs = v)),
  ];
}
function render() {
  const box = $('rgl'),
    d = app.drawing;
  document.querySelectorAll('#rgtools button[data-t]').forEach((b) => {
    const active = !!d && d.t === b.dataset.t;
    b.classList.toggle('on', active);
    b.textContent = active ? 'Cancel' : b.dataset.n;
  });
  $('rgf').hidden = !d || d.t === 'text' || d.t === 'marker';
  box.textContent = '';
  if (!app.objects.length) {
    const p = el('p', {
      class: 'hint',
      textContent:
        'Regions are freehand areas such as language groups, cultures or climate zones. Arrows show routes and migrations; text and markers label places. All of them sit on top of country colors.',
    });
    p.style.margin = '0';
    box.append(p);
    return;
  }
  app.objects.forEach((r, i) => {
    const t = r.t || 'region',
      selected = i === app.sel;
    const sw = el('input', {
      type: 'color',
      value: r.col,
      aria: { label: KIND[t] + ' color' },
      oninput: () => {
        r.col = sw.value.toLowerCase();
        redraw();
      },
      onchange: commit,
    });
    const tx = el('input', {
      type: 'text',
      value: r.label,
      placeholder: PLACEHOLDER[t] || 'Name (shows in legend)',
      aria: { label: KIND[t] + ' text' },
      oninput: () => {
        r.label = tx.value;
        redraw();
      },
      onchange: commit,
    });
    const editLabel =
      t === 'shape' ? 'Exact outline: its points follow the borders and cannot be edited' : selected ? 'Done editing' : 'Edit or move';
    const top = el(
      'div',
      { class: 'lg' },
      el('span', { class: 'kind', textContent: ICON[t], title: KIND[t] }),
      sw,
      tx,
      btn(
        selected ? '✓' : '✎',
        editLabel,
        () => {
          if (app.drawing) cancelDraw();
          select(selected ? -1 : i);
        },
        t === 'shape',
      ),
      btn('↑', 'Draw earlier (underneath)', () => moveObject(i, -1), i === 0),
      btn('↓', 'Draw later (on top)', () => moveObject(i, 1), i === app.objects.length - 1),
      btn('×', 'Delete ' + KIND[t], () => deleteObject(i)),
    );
    const row = el('div', { class: 'rg-row' + (selected ? ' on' : '') }, top);
    if (t === 'shape') row.append(el('div', { class: 'src', textContent: sourceText(r) }));
    row.append(el('div', { class: 'rg-opt' }, ...options(r)));
    box.append(row);
  });
}
export function initObjectsPanel() {
  document.querySelectorAll('#rgtools button[data-t]').forEach((b) => {
    b.dataset.n = b.textContent;
    b.onclick = () => startDraw(b.dataset.t);
  });
  $('rgf').onclick = finishDraw;
  $('rgc').onclick = shapeFromPainted;
  on('objects', render);
  render();
}
