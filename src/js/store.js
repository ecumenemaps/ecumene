// The single shared state object. Modules read and write fields on `app` directly;
// UI refreshes are requested through the tiny event bus at the bottom.
export const HOME = [-5, -30];

export const PRESETS = {
  light: {
    bg: '#ffffff',
    water: '#cfe6f5',
    land: '#f1efe9',
    border: '#8a97a3',
    river: '#4f93c4',
    grat: '#5f6b78',
    label: '#1b2430',
    shade: 0.4,
    bw: 1.1,
  },
  dark: {
    bg: '#0e1319',
    water: '#17364d',
    land: '#2c343d',
    border: '#66737f',
    river: '#5aa7d8',
    grat: '#e6ebf0',
    label: '#e6ebf0',
    shade: 1,
    bw: 1.1,
  },
  mc: {
    bg: '#ffffff',
    water: '#c9e4f9',
    land: '#eeeeee',
    border: '#9a9a9a',
    river: '#2f6db5',
    grat: '#8a8a8a',
    label: '#1c5f9b',
    shade: 0,
    bw: 1,
  },
};
export const STYLE_COLOR_KEYS = ['water', 'land', 'border', 'bg', 'river', 'grat', 'label'];

export const app = {
  // view
  rot: HOME.slice(),
  zoom: 1,
  W: 0,
  H: 0,
  dpr: 1,
  // pointer position in canvas pixels
  mx: 0,
  my: 0,
  ready: false,
  // country under the pointer (1-based id, 0 = none)
  hover: 0,
  // current paint colour
  active: '#e4572e',
  // country fills: name -> hex, and legend labels per colour
  fills: new Map(),
  labels: {},
  legend: { title: '', pos: 'bl', show: true, order: [] },
  // style and layers
  style: Object.assign({}, PRESETS.light, { font: 'sys' }),
  layers: { borders: true, lakes: true, rivers: false, grat: false, names: false, regions: true },
  hoverStyle: { dark: true, outline: false, tip: true, amt: 0.16 },
  // regions, arrows, text, markers and exact outlines (see regions.js)
  objects: [],
  sel: -1, // index of the selected object, -1 = none
  drawing: null, // {t, pts, col} while drawing a new object
  drag: null, // index of the vertex being dragged
  hoverObj: -1, // object under the pointer (for the name tag)
  pick: null, // subdivision picker state (see picker.js)
};

const handlers = {};
/** Subscribe to a UI refresh topic: 'legend', 'objects', 'history', 'style'. */
export const on = (topic, fn) => (handlers[topic] = handlers[topic] || []).push(fn);
export const emit = (topic) => (handlers[topic] || []).forEach((fn) => fn());

let frame = 0,
  renderFn = null;
export const setRenderer = (fn) => (renderFn = fn);
/** Request a redraw on the next animation frame (coalesced). */
export function redraw() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    if (app.ready && renderFn) renderFn();
  });
}
