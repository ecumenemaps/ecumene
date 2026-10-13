// Small shared helpers. No state lives here.
import { color } from 'd3-color';

export const $ = (id) => document.getElementById(id);
export const D = Math.PI / 180;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const hexOk = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
export const hx = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
export const rgb01 = (s) => hx(s).map((v) => v / 255);
export function lum(h) {
  const c = rgb01(h);
  return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
}
/** Text halo colour that contrasts with the given text colour. */
export const halo = (col) => (lum(col) > 0.5 ? '#101820' : '#ffffff');
export const darker = (c) => color(c).darker(0.9).formatHex();
/** Unit vector for a lon/lat in degrees. */
export function V(lo, la) {
  const l = lo * D,
    p = la * D,
    c = Math.cos(p);
  return [c * Math.cos(l), c * Math.sin(l), Math.sin(p)];
}
/** Status line under the panel. */
export function note(msg, bad) {
  const st = $('st');
  st.textContent = msg;
  st.style.color = bad ? '#c0392b' : '';
}
/** Small element factory: el('button', {type:'button', textContent:'x'}, child...) */
export function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props)
    for (const k in props) {
      if (k === 'class') e.className = props[k];
      else if (k === 'aria') for (const a in props.aria) e.setAttribute('aria-' + a, props.aria[a]);
      else e[k] = props[k];
    }
  for (const k of kids) if (k != null) e.append(k);
  return e;
}
export const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
