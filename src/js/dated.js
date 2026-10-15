// Dated layers (#46): units valid from one day (d0) to another (d1), both included, as yyyymmdd numbers like the
// Atlas of Historical County Boundaries stores them. Pure, unit tested.

/** The day dated layers show in a new map. */
export const DEFAULT_DAY = 18500101;
/** Is a unit (its properties) in force on day n? */
export const onDate = (p, n) => p.d0 <= n && n <= p.d1;
/** The units of a dated layer in force on day n. */
export const unitsAt = (feats, n) => feats.filter((f) => onDate(f.properties, n));

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const parts = (n) => [Math.floor(n / 1e4), Math.floor(n / 100) % 100, n % 100];
/** Is n a real day (yyyymmdd)? */
export function validDay(n) {
  if (!Number.isInteger(n)) return false;
  const [y, m, d] = parts(n),
    t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
/** "1 January 1850", or with short months "1 Jan 1850". */
export function fmtDay(n, short = false) {
  const [y, m, d] = parts(n),
    mo = MONTHS[m - 1];
  return d + ' ' + (short ? mo.slice(0, 3) : mo) + ' ' + y;
}
/** "7 Dec 1812 – 9 Aug 1821", or "from 3 Jan 1959" for a unit still in force on the layer's last day. */
export const fmtSpan = (p, last) => (p.d1 >= last ? 'from ' + fmtDay(p.d0, true) : fmtDay(p.d0, true) + ' – ' + fmtDay(p.d1, true));
/** yyyymmdd from a date input's "1850-01-01", or null. */
export function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  const n = m ? +m[1] * 1e4 + +m[2] * 100 + +m[3] : NaN;
  return validDay(n) ? n : null;
}
/** A date input's value for day n. */
export const isoDay = (n) => {
  const [y, m, d] = parts(n);
  return String(y).padStart(4, '0') + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
};
/** 1 January of a year, kept within [from, to] (the layer starts on 3 September 1783). */
export const yearDay = (y, from, to) => Math.min(to, Math.max(from, y * 1e4 + 101));
/** Day n kept within [from, to]. */
export const clampDay = (n, from, to) => Math.min(to, Math.max(from, n));
