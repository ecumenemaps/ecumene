// Pattern fills (hatching, dots, checkers). A paint is a hex color or a pattern "p:<type>:<background>:<pattern>",
// e.g. "p:diag:#e4572e:#222222", so fills, subdivisions, legend labels and saved maps keep using plain strings.
// Each pattern is a square tile in CSS pixels; the globe draws the same shapes in its fragment shader (gl.js
// patternMask, which must match), the overlay and PNG export use a canvas tile, and SVG export an SVG <pattern>.

/** Pattern types, in the order of their index in the globe's pattern texture (1-based; 0 is a plain color). */
export const PATTERNS = {
  diag: { name: 'Diagonal stripes', T: 8, w: 1.6 },
  diagw: { name: 'Wide diagonal stripes', T: 12, w: 4.5 },
  horiz: { name: 'Horizontal stripes', T: 8, w: 2 },
  vert: { name: 'Vertical stripes', T: 8, w: 2 },
  cross: { name: 'Crosshatch', T: 8, w: 1.2 },
  dots: { name: 'Dots', T: 8, r: 1.9 },
  check: { name: 'Checkers', T: 12 },
  fine: { name: 'Fine dots', T: 4, r: 0.75 },
};
export const PATTERN_TYPES = Object.keys(PATTERNS);
export const PATTERN_INK = '#222222';

const HEX = /^#[0-9a-f]{6}$/;
const RE = new RegExp('^p:(' + PATTERN_TYPES.join('|') + '):(#[0-9a-f]{6}):(#[0-9a-f]{6})$');
/** {type, bg, fg} of a pattern paint, or null for a plain color. */
export function parsePaint(v) {
  const m = typeof v === 'string' ? RE.exec(v) : null;
  return m ? { type: m[1], bg: m[2], fg: m[3] } : null;
}
export const isPattern = (v) => !!parsePaint(v);
/** A pattern paint string (colors lower-cased). */
export const patternPaint = (type, bg, fg = PATTERN_INK) => 'p:' + type + ':' + bg.toLowerCase() + ':' + fg.toLowerCase();
/** A valid paint: a hex color or a known pattern (case-insensitive hex is accepted, as saved maps may have it). */
export const paintOk = (v) => typeof v === 'string' && (HEX.test(v.toLowerCase()) || isPattern(v.toLowerCase()));
/** The solid color that stands for a paint where a pattern cannot be drawn (tiny markers, the clash check). */
export const baseColor = (v) => {
  const p = parsePaint(v);
  return p ? p.bg : v;
};
/** The same pattern on another background (the legend editor's color input changes the background). */
export const withBackground = (v, bg) => {
  const p = parsePaint(v);
  return p ? patternPaint(p.type, bg, p.fg) : bg;
};

/** SVG markup of a pattern's tile shapes (without the background), in tile units. */
function shapes(type, fg) {
  const P = PATTERNS[type],
    T = P.T,
    h = T / 2,
    line = (d, w) => '<path d="' + d + '" stroke="' + fg + '" stroke-width="' + w + '" fill="none"/>';
  switch (type) {
    case 'diag':
    case 'diagw':
      return line('M0,' + T + 'L' + T + ',0M' + -h + ',' + h + 'L' + h + ',' + -h + 'M' + h + ',' + (T + h) + 'L' + (T + h) + ',' + h, P.w);
    case 'cross':
      return (
        line('M0,' + T + 'L' + T + ',0M' + -h + ',' + h + 'L' + h + ',' + -h + 'M' + h + ',' + (T + h) + 'L' + (T + h) + ',' + h, P.w) +
        line('M0,0L' + T + ',' + T + 'M' + -h + ',' + h + 'L' + h + ',' + (T + h) + 'M' + h + ',' + -h + 'L' + (T + h) + ',' + h, P.w)
      );
    case 'horiz':
      return '<rect y="' + (h - P.w / 2) + '" width="' + T + '" height="' + P.w + '" fill="' + fg + '"/>';
    case 'vert':
      return '<rect x="' + (h - P.w / 2) + '" width="' + P.w + '" height="' + T + '" fill="' + fg + '"/>';
    case 'dots':
    case 'fine':
      return '<circle cx="' + h + '" cy="' + h + '" r="' + P.r + '" fill="' + fg + '"/>';
    case 'check':
      return (
        '<rect width="' +
        h +
        '" height="' +
        h +
        '" fill="' +
        fg +
        '"/><rect x="' +
        h +
        '" y="' +
        h +
        '" width="' +
        h +
        '" height="' +
        h +
        '" fill="' +
        fg +
        '"/>'
      );
  }
  return '';
}
/** The id and SVG <pattern> element for a pattern paint. */
export function svgPattern(v) {
  const p = parsePaint(v),
    T = PATTERNS[p.type].T,
    id = 'pat-' + p.type + '-' + p.bg.slice(1) + '-' + p.fg.slice(1);
  return {
    id,
    svg:
      '<pattern id="' +
      id +
      '" patternUnits="userSpaceOnUse" width="' +
      T +
      '" height="' +
      T +
      '">' +
      '<rect width="' +
      T +
      '" height="' +
      T +
      '" fill="' +
      p.bg +
      '"/>' +
      shapes(p.type, p.fg) +
      '</pattern>',
  };
}

// canvas tiles, drawn from the same SVG shapes so screen, PNG and SVG agree
const tiles = new Map();
/** A canvas tile for a pattern paint at a device-pixel scale (cached). Browser only. */
export function patternTile(v, scale = 1) {
  const key = v + '@' + scale;
  if (tiles.has(key)) return tiles.get(key);
  const p = parsePaint(v),
    T = PATTERNS[p.type].T,
    n = Math.max(1, Math.round(T * scale)),
    cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const c = cv.getContext('2d');
  c.scale(n / T, n / T);
  c.fillStyle = p.bg;
  c.fillRect(0, 0, T, T);
  // draw the shapes with Path2D from the same path data the SVG uses
  const svg = shapes(p.type, p.fg);
  for (const m of svg.matchAll(/<(path|rect|circle)([^>]*)\/>/g)) {
    const a = Object.fromEntries([...m[2].matchAll(/([\w-]+)="([^"]*)"/g)].map((x) => [x[1], x[2]]));
    if (m[1] === 'path') {
      c.strokeStyle = a.stroke;
      c.lineWidth = +a['stroke-width'];
      c.stroke(new Path2D(a.d));
    } else if (m[1] === 'rect') {
      c.fillStyle = a.fill;
      c.fillRect(+(a.x || 0), +(a.y || 0), +a.width, +a.height);
    } else {
      c.fillStyle = a.fill;
      c.beginPath();
      c.arc(+a.cx, +a.cy, +a.r, 0, 2 * Math.PI);
      c.fill();
    }
  }
  const out = { canvas: cv, scale: n / T };
  if (tiles.size > 200) tiles.clear();
  tiles.set(key, out);
  return out;
}

/**
 * Set a context's fill to a paint: a plain color as is; a pattern as an SVG <pattern> on the SVG recorder
 * (svgctx.js registerDef) or as a canvas pattern drawn at the given device-pixel scale.
 */
export function fillWith(c, v, scale = 1) {
  if (!isPattern(v)) {
    c.fillStyle = v;
    return;
  }
  if (c.registerDef) {
    const s = svgPattern(v);
    c.registerDef(s.id, s.svg);
    c.fillStyle = 'url(#' + s.id + ')';
    return;
  }
  const t = patternTile(v, scale),
    pat = c.createPattern(t.canvas, 'repeat');
  // the tile has scale device pixels per CSS pixel; undo that so the pattern is drawn at CSS size
  if (pat.setTransform) pat.setTransform(new DOMMatrix().scale(1 / t.scale));
  c.fillStyle = pat;
}

/** A small preview image (data URL) of a paint, for buttons in the panels. Browser only. */
export function previewURL(v, scale = 2) {
  return patternTile(v, scale).canvas.toDataURL();
}
