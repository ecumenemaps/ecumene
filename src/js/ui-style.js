// Panel: layers, hover behaviour and map style.
import { app, on, redraw, PRESETS } from './store.js';
import { FONTS, loadFont } from './fonts.js';
import { $, el } from './util.js';

const COLOR_INPUTS = [
  ['water', 'Water'],
  ['land', 'Land'],
  ['border', 'Borders'],
  ['bg', 'Background'],
  ['river', 'Rivers'],
  ['grat', 'Graticule'],
  ['label', 'Names'],
];

export function initStylePanel({ onHoverChange, refreshTip }) {
  const S = app.style,
    inputs = {};
  for (const [k, name] of COLOR_INPUTS) {
    const i = el('input', {
      type: 'color',
      value: S[k],
      aria: { label: name + ' color' },
      oninput: () => {
        S[k] = i.value;
        redraw();
      },
    });
    inputs[k] = i;
    $('cg').append(el('label', null, i, name));
  }
  $('sfont').replaceChildren(...Object.entries(FONTS).map(([k, v]) => el('option', { value: k, textContent: v[0] })));
  $('sfont').onchange = (e) => {
    S.font = e.target.value;
    loadFont();
    redraw();
  };
  $('pre').onchange = (e) => {
    Object.assign(S, PRESETS[e.target.value]);
    sync();
    redraw();
  };
  $('sbw').oninput = (e) => {
    S.bw = +e.target.value;
    redraw();
  };
  $('ssh').oninput = (e) => {
    S.shade = +e.target.value / 100;
    redraw();
  };
  const H = app.hoverStyle;
  $('shd').oninput = (e) => {
    H.amt = +e.target.value / 100;
    redraw();
  };
  $('hs').onchange = (e) => {
    const v = e.target.value;
    H.dark = v === 'dark' || v === 'both';
    H.outline = v === 'outline' || v === 'both';
    onHoverChange();
    redraw();
  };
  $('tg').onchange = (e) => {
    H.tip = e.target.checked;
    refreshTip();
  };
  document.querySelectorAll('[data-k]').forEach((i) => {
    app.layers[i.dataset.k] = i.checked;
    i.onchange = () => {
      app.layers[i.dataset.k] = i.checked;
      redraw();
    };
  });
  function sync() {
    for (const k in inputs) inputs[k].value = S[k];
    $('sfont').value = S.font;
    $('sbw').value = S.bw;
    $('ssh').value = Math.round(S.shade * 100);
    document.querySelectorAll('[data-k]').forEach((i) => (i.checked = !!app.layers[i.dataset.k]));
    $('hs').value = H.dark && H.outline ? 'both' : H.dark ? 'dark' : H.outline ? 'outline' : 'none';
    $('tg').checked = H.tip;
    $('shd').value = Math.round(H.amt * 100);
    onHoverChange();
  }
  on('style', sync);
  sync();
}
