// Label fonts. Web fonts are fetched only when chosen, so the default needs no network.
import { app, redraw } from './store.js';

export const FONTS = {
  sys: ['System sans', 'system-ui,-apple-system,"Segoe UI",sans-serif'],
  noto: ['Noto Sans', '"Noto Sans",sans-serif'],
  notoserif: ['Noto Serif', '"Noto Serif",serif'],
  plexc: ['IBM Plex Sans Condensed', '"IBM Plex Sans Condensed","Arial Narrow",sans-serif'],
  garamond: ['EB Garamond', '"EB Garamond",Garamond,serif'],
  georgia: ['Georgia', 'Georgia,serif'],
  verdana: ['Verdana', 'Verdana,sans-serif'],
  mono: ['Monospace', 'ui-monospace,Menlo,Consolas,monospace'],
};
const GOOGLE = { noto: 'Noto+Sans', notoserif: 'Noto+Serif', plexc: 'IBM+Plex+Sans+Condensed', garamond: 'EB+Garamond' };
const requested = new Set();
/** CSS font-family list for the current label font. */
export const fontFamily = () => (FONTS[app.style.font] || FONTS.sys)[1];
/** Canvas font string, e.g. font('600', 14). */
export const font = (weight, px, italic) => (italic ? 'italic ' : '') + weight + ' ' + px + 'px ' + fontFamily();
export function loadFont() {
  const g = GOOGLE[app.style.font];
  if (g && !requested.has(g)) {
    requested.add(g);
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=' + g + ':ital,wght@0,400;0,600;0,700;1,600&display=swap';
    l.onload = loadFont;
    document.head.appendChild(l);
  }
  try {
    const f = fontFamily();
    Promise.all(['400', '600', '700', 'italic 600'].map((w) => document.fonts.load(w + ' 14px ' + f))).then(redraw, () => {});
  } catch (_) {}
}
