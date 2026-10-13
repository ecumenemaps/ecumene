// Panel: layers, hover behaviour and map style.
import { app, on, emit, redraw, PRESETS, WIKI } from './store.js';
import { FONTS, loadFont } from './fonts.js';
import { $, el, note } from './util.js';

const COLOR_INPUTS = [
  ['water', 'Water'],
  ['land', 'Land'],
  ['border', 'Borders'],
  ['rim', 'Globe edge'],
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
    if (e.target.value === 'wikipedia') {
      // the conventions: 550 x 550 px orthographic globe centred on the subject, faint grid, no names
      Object.assign(app.layers, { grat: true, names: false, rivers: false, lakes: 'major' });
      Object.assign(app.exportOpts, { proj: 'ortho', area: 'world', width: 550 });
      app.active = WIKI.subject;
      app.legend.note = false; // Commons keeps sources on the file page; the SVG still carries them in <desc>
      emit('palette');
      emit('export');
      emit('legendopts');
      note('Wikipedia style: paint the subject in dark green and related areas (such as the rest of the EU) in ' + WIKI.related + '. Centre the globe on the subject before exporting.');
    }
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
  // Checkboxes hold booleans; the lakes <select> holds a mode string.
  const layerVal = (i) => (i.type === 'checkbox' ? i.checked : i.value);
  document.querySelectorAll('[data-k]').forEach((i) => {
    app.layers[i.dataset.k] = layerVal(i);
    i.onchange = () => {
      app.layers[i.dataset.k] = layerVal(i);
      redraw();
    };
  });
  function sync() {
    for (const k in inputs) inputs[k].value = S[k];
    $('sfont').value = S.font;
    $('sbw').value = S.bw;
    $('ssh').value = Math.round(S.shade * 100);
    document.querySelectorAll('[data-k]').forEach((i) => {
      if (i.type === 'checkbox') i.checked = !!app.layers[i.dataset.k];
      else i.value = app.layers[i.dataset.k];
    });
    $('hs').value = H.dark && H.outline ? 'both' : H.dark ? 'dark' : H.outline ? 'outline' : 'none';
    $('tg').checked = H.tip;
    $('shd').value = Math.round(H.amt * 100);
    onHoverChange();
  }
  on('style', sync);
  sync();
}
