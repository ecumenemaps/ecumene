// Panel: legend editor (country colours: rename, recolour, reorder, remove; title and position).
import { app, on, redraw } from './store.js';
import { recolor, removeColour, colourCounts, legendColours } from './paint.js';
import { commit } from './history.js';
import { $, el } from './util.js';
import { PATTERNS, isPattern, parsePaint, baseColor, withBackground, previewURL } from './patterns.js';

function render() {
  const box = $('lgd'),
    counts = colourCounts();
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
    // a pattern's color input changes its background; a preview shows the pattern itself
    const pat = isPattern(col);
    const sw = el('input', {
      type: 'color',
      value: baseColor(col),
      aria: { label: (pat ? 'Change the background of ' : 'Change color ') + col },
      onchange: () => {
        recolor(col, withBackground(col, sw.value.toLowerCase()));
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
      removeColour(col);
      render();
      redraw();
      commit();
    };
    box.append(
      el(
        'div',
        { class: 'lg' },
        pat ? el('span', { class: 'lgp', style: 'background-image:url(' + previewURL(col) + ');background-size:' + PATTERNS[parsePaint(col).type].T + 'px' }) : null,
        sw,
        name,
        el('small', { textContent: counts[col] }),
        btn('↑', 'Move up', move(-1), i === 0),
        btn('↓', 'Move down', move(1), i === cols.length - 1),
        btn('×', 'Remove this color from all countries and subdivisions', remove),
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
