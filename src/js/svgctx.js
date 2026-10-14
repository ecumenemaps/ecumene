// A recording stand-in for CanvasRenderingContext2D that writes SVG instead of pixels.
// It covers the subset of the canvas API that d3-geo's geoPath and overlay.js use, so the same
// drawing code produces both the on-screen overlay and vector exports.
//
// Path points are transformed when they are added (as on a real canvas), rounded to 0.1 px and
// written as relative moves; points under 0.35 px apart are thinned, which keeps detailed
// coastlines small at globe scale without visible change.
import { color } from 'd3-color';

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const r1 = (v) => {
  const x = Math.round(v * 10) / 10;
  return Object.is(x, -0) ? 0 : x;
};
const num = (v) => String(r1(v));

/** Split a CSS colour into an SVG-safe hex plus opacity (Inkscape and some tools ignore rgba()). */
export function paint(css) {
  if (css === 'none' || css == null) return { c: 'none', a: 1 };
  const k = color(css);
  if (!k) return { c: String(css), a: 1 };
  return { c: k.formatHex(), a: k.opacity };
}

/** Parse a canvas font shorthand like `italic 600 14px "Noto Sans",sans-serif`. */
export function parseFont(f) {
  const m = /^\s*(italic\s+)?(\d{3}|normal|bold)?\s*([\d.]+)px\s+(.+)$/.exec(f || '');
  if (!m) return { style: 'normal', weight: '400', size: 10, family: 'sans-serif' };
  return { style: m[1] ? 'italic' : 'normal', weight: m[2] || '400', size: +m[3], family: m[4].trim() };
}

const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

export class SvgContext {
  constructor(measure) {
    this.out = [];
    this.stack = [];
    this.d = [];
    this.last = null;
    this.next = null; // extra attributes for the next element
    this.tol = 0.35; // px
    this.pend = null;
    this.measurer = measure || null;
    this.m = [1, 0, 0, 1, 0, 0];
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.lineWidth = 1;
    this.lineCap = 'butt';
    this.lineJoin = 'miter';
    this.globalAlpha = 1;
    this.font = '10px sans-serif';
    this.textAlign = 'start';
    this.textBaseline = 'alphabetic';
    this.dash = [];
  }
  // ---- state
  save() {
    const { m, fillStyle, strokeStyle, lineWidth, lineCap, lineJoin, globalAlpha, font, textAlign, textBaseline, dash } = this;
    this.stack.push({ m: m.slice(), fillStyle, strokeStyle, lineWidth, lineCap, lineJoin, globalAlpha, font, textAlign, textBaseline, dash });
  }
  restore() {
    const s = this.stack.pop();
    if (s) Object.assign(this, s);
  }
  translate(x, y) {
    this.m = mul(this.m, [1, 0, 0, 1, x, y]);
  }
  rotate(a) {
    const c = Math.cos(a),
      s = Math.sin(a);
    this.m = mul(this.m, [c, s, -s, c, 0, 0]);
  }
  scale(x, y) {
    this.m = mul(this.m, [x, 0, 0, y, 0, 0]);
  }
  setTransform(a, b, c, d, e, f) {
    this.m = [a, b, c, d, e, f];
  }
  setLineDash(d) {
    this.dash = d || [];
  }
  getLineDash() {
    return this.dash.slice();
  }
  // ---- paths
  tx(x, y) {
    const m = this.m;
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  }
  // Points closer than `tol` px to the last written one are held back (only the latest is kept,
  // and it is written before the subpath ends), so shapes keep their exact end points.
  beginPath() {
    this.d = [];
    this.last = null;
    this.pend = null;
  }
  flush() {
    if (!this.pend) return;
    const [a, b] = this.pend;
    this.d.push('l' + r1(a - this.last[0]) + ' ' + r1(b - this.last[1]));
    this.last = [a, b];
    this.pend = null;
  }
  moveTo(x, y) {
    this.flush();
    const p = this.tx(x, y),
      a = r1(p[0]),
      b = r1(p[1]);
    this.d.push('M' + a + ' ' + b);
    this.last = [a, b];
  }
  lineTo(x, y) {
    if (!this.last) return this.moveTo(x, y);
    const p = this.tx(x, y),
      a = r1(p[0]),
      b = r1(p[1]),
      dx = a - this.last[0],
      dy = b - this.last[1];
    if (dx * dx + dy * dy < this.tol * this.tol) {
      this.pend = [a, b];
      return;
    }
    this.pend = null;
    this.d.push('l' + r1(dx) + ' ' + r1(dy));
    this.last = [a, b];
  }
  closePath() {
    this.flush();
    if (this.d.length) this.d.push('Z');
  }
  rect(x, y, w, h) {
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
  }
  /** Arcs become polylines (fine for markers and point dots, which are all this is used for). */
  arc(x, y, r, a0, a1, ccw) {
    let sweep = a1 - a0;
    if (ccw) sweep = sweep > 0 ? sweep - 2 * Math.PI : sweep;
    if (Math.abs(sweep) >= 2 * Math.PI) sweep = 2 * Math.PI * Math.sign(sweep || 1);
    const n = Math.max(8, Math.ceil((Math.abs(sweep) / (2 * Math.PI)) * 40));
    for (let i = 0; i <= n; i++) {
      const a = a0 + (sweep * i) / n,
        px = x + r * Math.cos(a),
        py = y + r * Math.sin(a);
      if (i === 0 && !this.last) this.moveTo(px, py);
      else this.lineTo(px, py);
    }
  }
  // ---- output
  /** Attach attributes (id, data-*, class) to the next element written. */
  tag(attrs) {
    this.next = attrs;
  }
  raw(s) {
    this.out.push(s);
  }
  group(id, attrs = '') {
    this.out.push('<g id="' + esc(id) + '"' + attrs + '>');
  }
  end() {
    this.out.push('</g>');
  }
  scaleFactor() {
    const m = this.m;
    return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  }
  extra() {
    const t = this.next;
    this.next = null;
    if (!t) return '';
    return Object.keys(t)
      .map((k) => ' ' + k + '="' + esc(t[k]) + '"')
      .join('');
  }
  strokeAttrs() {
    const p = paint(this.strokeStyle),
      k = this.scaleFactor();
    let s = ' stroke="' + p.c + '" stroke-width="' + +(this.lineWidth * k).toFixed(2) + '"';
    const a = p.a * this.globalAlpha;
    if (a < 1) s += ' stroke-opacity="' + +a.toFixed(3) + '"';
    if (this.lineCap !== 'butt') s += ' stroke-linecap="' + this.lineCap + '"';
    if (this.lineJoin !== 'miter') s += ' stroke-linejoin="' + this.lineJoin + '"';
    if (this.dash.length) s += ' stroke-dasharray="' + this.dash.map((v) => +(v * k).toFixed(2)).join(' ') + '"';
    return s;
  }
  fillAttrs() {
    const p = paint(this.fillStyle);
    let s = ' fill="' + p.c + '"';
    const a = p.a * this.globalAlpha;
    if (a < 1) s += ' fill-opacity="' + +a.toFixed(3) + '"';
    return s;
  }
  pathEl(attrs, rule) {
    this.flush();
    if (!this.d.length) return;
    this.out.push('<path' + this.extra() + ' d="' + this.d.join('') + '"' + attrs + (rule ? ' fill-rule="' + rule + '"' : '') + '/>');
  }
  fill(rule) {
    this.pathEl(this.fillAttrs(), rule);
  }
  stroke() {
    this.pathEl(' fill="none"' + this.strokeAttrs());
  }
  /** Fill and stroke as one element (SVG only; a canvas needs fill() then stroke()). */
  fillStroke() {
    this.pathEl(this.fillAttrs() + this.strokeAttrs());
  }
  fillRect(x, y, w, h) {
    const d = this.d,
      l = this.last,
      q = this.pend;
    this.beginPath();
    this.rect(x, y, w, h);
    this.fill();
    this.d = d;
    this.last = l;
    this.pend = q;
  }
  strokeRect(x, y, w, h) {
    const d = this.d,
      l = this.last,
      q = this.pend;
    this.beginPath();
    this.rect(x, y, w, h);
    this.stroke();
    this.d = d;
    this.last = l;
    this.pend = q;
  }
  clearRect() {}
  textEl(t, x, y, paintAttrs) {
    const f = parseFont(this.font),
      anchor = { center: 'middle', right: 'end', end: 'end' }[this.textAlign] || 'start',
      base = { middle: 'central', top: 'hanging', hanging: 'hanging', bottom: 'text-after-edge' }[this.textBaseline];
    const m = this.m;
    const tr =
      m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1
        ? ''
        : ' transform="matrix(' + m.map((v) => +v.toFixed(4)).join(' ') + ')"';
    // the translation-only case is folded into x/y so plain files stay easy to edit
    const px = tr ? x : x + m[4],
      py = tr ? y : y + m[5];
    this.out.push(
      '<text' +
        this.extra() +
        ' x="' + num(px) + '" y="' + num(py) + '"' + tr +
        ' font-family="' + esc(f.family) + '" font-size="' + f.size + '"' +
        (f.weight !== '400' && f.weight !== 'normal' ? ' font-weight="' + f.weight + '"' : '') +
        (f.style === 'italic' ? ' font-style="italic"' : '') +
        (anchor !== 'start' ? ' text-anchor="' + anchor + '"' : '') +
        (base ? ' dominant-baseline="' + base + '"' : '') +
        paintAttrs + '>' + esc(t) + '</text>',
    );
  }
  fillText(t, x, y) {
    this.textEl(t, x, y, this.fillAttrs());
  }
  strokeText(t, x, y) {
    this.textEl(t, x, y, ' fill="none"' + this.strokeAttrs());
  }
  measureText(t) {
    if (this.measurer) {
      this.measurer.font = this.font;
      return this.measurer.measureText(t);
    }
    return { width: String(t).length * parseFont(this.font).size * 0.55 };
  }
  drawImage() {}
  /** Add a reusable definition (a <pattern>) once, by id; it is written in <defs> at the top. */
  registerDef(id, markup) {
    (this.defs || (this.defs = new Map())).set(id, markup);
  }
  /** The finished document. */
  toString(w, h, head = '') {
    const defs = this.defs && this.defs.size ? '<defs>\n' + [...this.defs.values()].join('\n') + '\n</defs>\n' : '';
    return (
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">\n' +
      defs +
      head +
      this.out.join('\n') +
      '\n</svg>\n'
    );
  }
}
export { esc };
