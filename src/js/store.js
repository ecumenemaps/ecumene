// The single shared state object. Modules read and write fields on `app` directly;
// UI refreshes are requested through the tiny event bus at the bottom.

/** App version, shown in exports and the scripting API. */
export const VERSION = '0.2.0';
export const HOME = [-5, -30];

export const PRESETS = {
  light: {
    bg: '#ffffff',
    water: '#cfe6f5',
    land: '#f1efe9',
    border: '#8a97a3',
    rim: '#8a97a3',
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
    rim: '#66737f',
    river: '#5aa7d8',
    grat: '#e6ebf0',
    label: '#e6ebf0',
    shade: 1,
    bw: 1.1,
  },
  classic: {
    bg: '#ffffff',
    water: '#c9e4f9',
    land: '#eeeeee',
    border: '#9a9a9a',
    rim: '#9a9a9a',
    river: '#2f6db5',
    grat: '#8a8a8a',
    label: '#1c5f9b',
    shade: 0,
    bw: 1,
  },
  // Wikipedia orthographic locator-map conventions (WikiProject Maps): grey land, white borders and
  // water, grey globe edge. Paint the subject #346733 and related areas #c6debd.
  wikipedia: {
    bg: '#ffffff',
    water: '#ffffff',
    land: '#b9b9b9',
    border: '#ffffff',
    rim: '#aaaaaa',
    river: '#ffffff',
    grat: '#8c8c8c', // the convention's 0.3 px black at 30% opacity, matched in weight for 1 px lines
    label: '#000000',
    shade: 0.5,
    bw: 0.5,
  },
};
/** Colours used with the Wikipedia preset. */
export const WIKI = { subject: '#346733', related: '#c6debd' };
/** Lake layer options: none, Natural Earth's major lakes (scalerank 0-1), or all 10m lakes. */
export const LAKE_MODES = ['none', 'major', 'all'];
export const STYLE_COLOR_KEYS = ['water', 'land', 'border', 'rim', 'bg', 'river', 'grat', 'label'];

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
  active: '#e4572e', // the paint clicks apply: a hex color or a pattern (patterns.js)
  solid: '#e4572e', // the last plain color chosen: patterns are drawn on it
  ink: '#222222', // pattern color
  paintSet: 'Default', // swatch set in the paint panel (schemes.js PAINT_SETS)
  // color by data: scale (schemes.js SCALES), classes, method, centre for diverging scales ('' = automatic), reversed
  data: { scale: 'Blues', n: 5, m: 'equal', c: '', rev: false, nd: true }, // nd: mark countries without data
  // the statistic the map was colored with, saved with it (stats.js validRecord): {k:'wb', c, y, t, v, ys?} or {k:'ev'}
  stat: null,
  cvd: '', // color-vision preview on screen ('' = normal)
  // country fills: name -> hex, and legend labels per colour
  fills: new Map(),
  labels: {},
  // painted subdivisions: 'Country|adm1_code' -> hex (see units.js)
  units: new Map(),
  // Subdivisions setting: on, and detail ('u' finest units, 'r' regions, 'g' constituent parts)
  sub: { on: false, detail: 'u', layer: {} }, // layer: country -> the subdivision layer chosen for it (units.js)
  subHov: null, // {country, feats, label} the units a click would paint, while the pointer is over them
  // pos: corner; xy: dragged position as fractions of the frame (null = use the corner); scale: size
  legend: { title: '', pos: 'bl', xy: null, scale: 1, show: true, note: true, order: [] },
  legendRect: null, // where the legend was last drawn on screen

  // export settings (projection key from projections.js, 'screen' or 'world', width in px or 0 = automatic)
  exportOpts: { proj: 'ortho', area: 'screen', width: 0 },
  // style and layers
  style: Object.assign({}, PRESETS.light, { font: 'sys' }),
  layers: { borders: true, lakes: 'major', rivers: false, grat: false, names: false, regions: true, tiny: true },
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
