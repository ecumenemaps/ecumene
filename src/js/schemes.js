// Color schemes for painting and for coloring by data, and color-vision simulation (pure, unit tested).
// Class colors come from ColorBrewer's designed schemes (Cynthia Brewer, Penn State; Apache 2.0, via
// d3-scale-chromatic), whose ratings say which are color-blind safe and print well. Viridis and Cividis are sampled.
import {
  schemeBlues,
  schemeGreens,
  schemeOranges,
  schemePurples,
  schemeReds,
  schemeGreys,
  schemeYlOrRd,
  schemeYlGnBu,
  schemeRdBu,
  schemePuOr,
  schemeBrBG,
  schemePiYG,
  schemeRdYlBu,
  schemeSet2,
  schemeDark2,
  schemePaired,
  schemeTableau10,
  interpolateViridis,
  interpolateCividis,
} from 'd3-scale-chromatic';
import { color } from 'd3-color';

/**
 * Scales for coloring by data. kind: 'seq' (low to high) or 'div' (either side of a centre). cb: color-blind safe,
 * print: prints well in color (ColorBrewer's ratings; Viridis and Cividis are designed for both). A ColorBrewer scale
 * gives an array of k colors for k from 3 to 9 (diverging up to 11).
 */
export const SCALES = {
  Blues: { kind: 'seq', s: schemeBlues, cb: true, print: true },
  Greens: { kind: 'seq', s: schemeGreens, cb: true, print: true },
  Oranges: { kind: 'seq', s: schemeOranges, cb: true, print: true },
  Purples: { kind: 'seq', s: schemePurples, cb: true, print: true },
  Reds: { kind: 'seq', s: schemeReds, cb: true, print: true },
  Greys: { kind: 'seq', s: schemeGreys, cb: true, print: true },
  'Yellow-Orange-Red': { kind: 'seq', s: schemeYlOrRd, cb: true, print: true },
  'Yellow-Green-Blue': { kind: 'seq', s: schemeYlGnBu, cb: true, print: true },
  Viridis: { kind: 'seq', f: interpolateViridis, cb: true, print: true },
  Cividis: { kind: 'seq', f: interpolateCividis, cb: true, print: true },
  'Red-Blue': { kind: 'div', s: schemeRdBu, cb: true, print: true },
  'Purple-Orange': { kind: 'div', s: schemePuOr, cb: true, print: true },
  'Brown-Teal': { kind: 'div', s: schemeBrBG, cb: true, print: true },
  'Pink-Green': { kind: 'div', s: schemePiYG, cb: true, print: true },
  'Red-Yellow-Blue': { kind: 'div', s: schemeRdYlBu, cb: true, print: true },
};

/** Paint swatch sets. cb: color-blind safe for up to that many colors (ColorBrewer), or true for all of them. */
export const PAINT_SETS = {
  Default: { c: ['#e4572e', '#f2a541', '#f6d743', '#7cc06b', '#2a9d8f', '#3d8bd9', '#5b5fc7', '#a05cc7', '#d6539f', '#7a6a5b'], cb: 0 },
  // Okabe and Ito (2002), "Color Universal Design", the usual color-blind safe set
  'Okabe–Ito': { c: ['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7', '#000000'], cb: true },
  'Set 2': { c: schemeSet2, cb: 3 },
  'Dark 2': { c: schemeDark2, cb: 3 },
  Paired: { c: schemePaired, cb: 4 },
  'Tableau 10': { c: schemeTableau10, cb: 0 },
};

/** A plain-language note on a scale's or set's safety, for the panel. */
export function safetyNote(x) {
  if (x.note) return x.note;
  const p = [];
  if (x.cb === true) p.push('Color-blind safe');
  else if (x.cb) p.push('Color-blind safe for up to ' + x.cb + ' colors');
  else p.push('Not color-blind safe');
  if (x.print) p.push('prints well');
  return p.join(', ') + '.';
}

/**
 * k class colors of a scale, low to high (reverse flips them). Sequential ColorBrewer scales drop their lightest
 * color where they can, which is near white and hard to see on land; diverging ones keep their light middle.
 */
export function classColors(name, k, reverse) {
  const S = SCALES[name];
  let out;
  if (S.f) out = Array.from({ length: k }, (_, i) => color(S.f(k === 1 ? 0.5 : i / (k - 1))).formatHex());
  else if (S.kind === 'seq') {
    const m = Math.max(3, Math.min(9, k + 1)),
      a = S.s[m] || S.s[9];
    out = a.slice(a.length - k);
    // two classes: the darker half of a three-class scale is too similar; take its ends
    if (k === 2) out = [S.s[3][1], S.s[3][2]];
  } else {
    const m = Math.max(3, Math.min(11, k));
    out = k < 3 ? [S.s[3][0], S.s[3][2]].slice(0, k) : S.s[m].slice();
  }
  out = out.map((c) => color(c).formatHex());
  return reverse ? out.reverse() : out;
}

/**
 * Class bounds for a diverging scale: n classes of equal width either side of the centre, so equal values above
 * and below it get matching shades (with an odd n the middle class straddles the centre). Returns n+1 bounds.
 */
export function divergingBreaks(values, n, centre) {
  let span = 0;
  for (const v of values) span = Math.max(span, Math.abs(v - centre));
  if (!span) span = 1;
  return Array.from({ length: n + 1 }, (_, i) => centre - span + (2 * span * i) / n);
}

// ---- color vision
const lin = (u) => (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
const gam = (u) => (u <= 0.0031308 ? 12.92 * u : 1.055 * u ** (1 / 2.4) - 0.055);
/**
 * Machado, Oliveira and Fernandes (2009), severity 1, in linear RGB; achromatopsia is luminance only. The same
 * matrices drive the screen preview (SVG feColorMatrix, which works in linear RGB) and the clash check.
 */
export const CVD = {
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
  achromatopsia: [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722],
};
export const CVD_NAMES = {
  deuteranopia: 'Deuteranopia (green-blind, the most common)',
  protanopia: 'Protanopia (red-blind)',
  tritanopia: 'Tritanopia (blue-blind, rare)',
  achromatopsia: 'Achromatopsia (no color)',
};
const rgb = (hex) => {
  const c = color(hex).rgb();
  return [c.r / 255, c.g / 255, c.b / 255];
};
/** A hex color as seen with a color-vision deficiency. */
export function simulate(hex, type) {
  const M = CVD[type],
    [r, g, b] = rgb(hex).map(lin),
    o = [0, 1, 2].map((i) => Math.min(1, Math.max(0, M[3 * i] * r + M[3 * i + 1] * g + M[3 * i + 2] * b)));
  return (
    '#' +
    o
      .map((u) =>
        Math.round(gam(u) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

// CIE Lab (D65) and CIEDE2000, the usual measure of how different two colors look
function lab(hex) {
  const [r, g, b] = rgb(hex).map(lin);
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047),
    y = f(0.2126 * r + 0.7152 * g + 0.0722 * b),
    z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
/** CIEDE2000 color difference between two hex colors (about 2 is just noticeable; under 10 is hard to tell apart on a map). */
export const deltaE = (h1, h2) => deltaE00(lab(h1), lab(h2));
/** CIEDE2000 between two CIE Lab colors (Sharma, Wu and Dalal 2005). */
export function deltaE00([L1, a1, b1], [L2, a2, b2]) {
  const D = Math.PI / 180;
  const C1 = Math.hypot(a1, b1),
    C2 = Math.hypot(a2, b2),
    Cm = (C1 + C2) / 2,
    G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1,
    a2p = (1 + G) * a2,
    C1p = Math.hypot(a1p, b1),
    C2p = Math.hypot(a2p, b2);
  const hp = (b, a) => (a === 0 && b === 0 ? 0 : (Math.atan2(b, a) / D + 360) % 360);
  const h1p = hp(b1, a1p),
    h2p = hp(b2, a2p);
  const dL = L2 - L1,
    dC = C2p - C1p;
  let dh = 0;
  if (C1p * C2p) dh = h2p - h1p > 180 ? h2p - h1p - 360 : h2p - h1p < -180 ? h2p - h1p + 360 : h2p - h1p;
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh / 2) * D);
  const Lm = (L1 + L2) / 2,
    Cpm = (C1p + C2p) / 2;
  let hm = h1p + h2p;
  if (C1p * C2p) hm = Math.abs(h1p - h2p) > 180 ? (h1p + h2p + (h1p + h2p < 360 ? 360 : -360)) / 2 : (h1p + h2p) / 2;
  const T =
    1 -
    0.17 * Math.cos((hm - 30) * D) +
    0.24 * Math.cos(2 * hm * D) +
    0.32 * Math.cos((3 * hm + 6) * D) -
    0.2 * Math.cos((4 * hm - 63) * D);
  const SL = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2),
    SC = 1 + 0.045 * Cpm,
    SH = 1 + 0.015 * Cpm * T,
    RT = -2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hm - 275) / 25) ** 2)) * D);
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}
/** How different two map colors must look to be told apart easily. */
export const CLASH = 10;
/**
 * Pairs of colors that look clearly different with normal vision but alike with a color-vision deficiency:
 * [{type, a, b}] for the given types (default the three dichromacies; achromatopsia is rare and makes most
 * maps clash).
 */
export function clashes(colors, types = ['deuteranopia', 'protanopia', 'tritanopia']) {
  const out = [];
  for (const type of types)
    for (let i = 0; i < colors.length; i++)
      for (let j = i + 1; j < colors.length; j++) {
        const a = colors[i],
          b = colors[j];
        if (deltaE(a, b) >= CLASH && deltaE(simulate(a, type), simulate(b, type)) < CLASH) out.push({ type, a, b });
      }
  return out;
}
