// Panel: legend editor (country colours: rename, recolour, reorder, remove; title and position).
import { app, on, redraw } from './store.js';
import { setFill, recolor, legendColours } from './paint.js';
import { commit } from './history.js';
import { $, el } from './util.js';

function render() {
  const box = $('lgd'),
    counts = {};
  app.fills.forEach((c) => (counts[c] = (counts[c] || 0) + 1));
  const cols = legendColours();
  box.textContent = '';
  if (!cols.length) {
    box.append(el('p', { class: 'hint', textContent: 'Painted colors appear here. Name a color to add it to the saved image.' }));
    box.firstChild.style.margin = '0';
    return;
  }
  const btn = (t, label, fn, disabled) =>
    el('button', { type: 'button', textContent: t, aria: { label }, disabled: !!disabled, onclick: fn });
  cols.forEach((col, i) => {
    const sw = el('input', {
      type: 'color',
      value: col,
      aria: { label: 'Change color ' + col },
      onchange: () => {
        recolor(col, sw.value.toLowerCase());
        render();
        redraw();
        commit();
      },
    });
    const name = el('input', {
      type: 'text',
      placeholder: 'Name this color',
      value: app.labels[col] || '',
      aria: { label: 'Label for ' + col },
      oninput: () => (app.labels[col] = name.value),
    });
    const move = (d) => () => {
      const O = app.legend.order,
        j = i + d;
      [O[i], O[j]] = [O[j], O[i]];
      render();
    };
    const remove = () => {
      [...app.fills.keys()].filter((k) => app.fills.get(k) === col).forEach((k) => setFill(k, null));
      render();
      redraw();
      commit();
    };
    box.append(
      el(
        'div',
        { class: 'lg' },
        sw,
        name,
        el('small', { textContent: counts[col] }),
        btn('↑', 'Move up', move(-1), i === 0),
        btn('↓', 'Move down', move(1), i === cols.length - 1),
        btn('×', 'Remove this color from all countries', remove),
      ),
    );
  });
}
export function initLegendPanel() {
  const L = app.legend;
  $('lt').oninput = (e) => (L.title = e.target.value);
  const syncPos = () => {
    $('lp').querySelector('[value=xy]').hidden = !L.xy;
    $('lp').value = L.xy ? 'xy' : L.pos;
  };
  $('lp').onchange = (e) => {
    if (e.target.value === 'xy') return;
    L.pos = e.target.value;
    L.xy = null;
    syncPos();
    redraw();
  };
  $('ls').onchange = (e) => {
    L.show = e.target.checked;
    redraw();
  };
  $('lk').oninput = (e) => {
    L.scale = +e.target.value / 100;
    redraw();
  };
  $('lt').addEventListener('input', redraw);
  $('lgd').addEventListener('input', redraw); // renamed entries show on the map at once
  on('legend', () => {
    render();
    redraw();
  });
  on('legendpos', syncPos);
  on('style', () => {
    $('lt').value = L.title;
    syncPos();
    $('ls').checked = L.show;
    $('lk').value = Math.round(L.scale * 100);
  });
  render();
}
