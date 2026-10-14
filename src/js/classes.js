// Class breaks for coloring by data (pure, unit tested): natural breaks (Jenks), equal intervals and quantiles, then
// edges rounded to two significant figures, and whole-number classes for whole-number data, with the legend labels.
// Countries are classed with the rounded edges, so the legend always matches the colors.

/**
 * Natural breaks (Fisher–Jenks): the k classes of sorted values that make the values within each class as alike as
 * possible (least total squared deviation). Returns k+1 edges, from the smallest value to the largest.
 */
export function jenks(values, k) {
  const v = values.slice().sort((a, b) => a - b),
    n = v.length;
  k = Math.max(1, Math.min(k, new Set(v).size));
  if (k === 1) return [v[0], v[n - 1]];
  // lower[i][j]: first index of the last class when i values are split into j classes; cost[i][j]: its variance sum
  const lower = Array.from({ length: n + 1 }, () => new Int32Array(k + 1)),
    cost = Array.from({ length: n + 1 }, () => new Float64Array(k + 1).fill(Infinity));
  for (let j = 1; j <= k; j++) {
    lower[1][j] = 1;
    cost[1][j] = 0;
  }
  for (let i = 2; i <= n; i++) {
    let s = 0,
      s2 = 0,
      w = 0;
    for (let m = 1; m <= i; m++) {
      const lo = i - m + 1,
        x = v[lo - 1];
      s += x;
      s2 += x * x;
      w++;
      const ss = s2 - (s * s) / w;
      if (lo > 1)
        for (let j = 2; j <= k; j++) {
          const c = ss + cost[lo - 1][j - 1];
          if (c < cost[i][j]) {
            lower[i][j] = lo;
            cost[i][j] = c;
          }
        }
    }
    lower[i][1] = 1;
    cost[i][1] = s2 - (s * s) / w;
  }
  const b = new Array(k + 1);
  b[0] = v[0];
  b[k] = v[n - 1];
  let i = n;
  for (let j = k; j >= 2; j--) {
    const lo = lower[i][j] - 1;
    b[j - 1] = v[lo - 1];
    i = lo;
  }
  return b;
}

/** Equal intervals or quantiles, as before: n+1 edges. */
function simple(v, n, method) {
  const lo = v[0],
    hi = v[v.length - 1],
    b = [];
  if (method === 'quantile')
    for (let i = 0; i <= n; i++) {
      const p = (i / n) * (v.length - 1),
        f = Math.floor(p),
        c = Math.ceil(p);
      b.push(v[f] + (v[c] - v[f]) * (p - f));
    }
  else for (let i = 0; i <= n; i++) b.push(lo + ((hi - lo) * i) / n);
  return b;
}

/** Round to two significant figures (1,234 -> 1,200; 0.0456 -> 0.046; 57 -> 57). */
export const round2 = (x) => (x === 0 ? 0 : +x.toPrecision(2));

/**
 * The class edges for values: method 'jenks', 'quantile' or 'equal', n classes. Inner edges are rounded to two
 * significant figures (to whole numbers when every value is whole); the outer edges stay at the smallest and largest
 * value. Edges that round onto each other are merged, so there can be fewer classes than asked for.
 * Returns {b: edges, int: whether the data is whole numbers}.
 */
export function classBreaks(values, n, method) {
  const v = values.slice().sort((a, b) => a - b),
    int = v.every(Number.isInteger),
    lo = v[0],
    hi = v[v.length - 1];
  if (lo === hi) return { b: [lo, hi], int };
  const raw = method === 'jenks' ? jenks(v, n) : simple(v, n, method);
  const inner = raw.slice(1, -1).map((x) => (int ? Math.round(round2(x)) : round2(x)));
  const b = [lo];
  for (const x of inner) if (x > b[b.length - 1] && x < hi) b.push(x);
  b.push(hi);
  return { b, int };
}

/** The class of a value: edges are upper bounds (a value equal to an edge goes in the class below it). */
export function classIndex(x, b) {
  for (let i = 1; i < b.length; i++) if (x <= b[i]) return i - 1;
  return b.length - 2;
}

/**
 * Legend labels for the classes. Whole numbers get ranges that do not overlap ("3 to 6", "7 to 11"); other values
 * "a to b" with the shared edge, the upper bound belonging to the class. fmt formats one number.
 */
export function classLabels(b, int, fmt) {
  const out = [];
  for (let i = 0; i < b.length - 1; i++) {
    const a = int && i > 0 ? b[i] + 1 : b[i],
      z = b[i + 1];
    out.push(a === z ? fmt(a) : fmt(a) + ' to ' + fmt(z));
  }
  return out;
}
