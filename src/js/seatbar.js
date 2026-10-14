// The seat counter on the map: a bar like the legend, shown when an election map (seats.js ELECTIONS) has painted
// units, counting seats per paint colour as they are painted. It can be dragged anywhere (input.js) and is drawn on the
// screen and in PNG and SVG exports through the same canvas calls.
import { app } from './store.js';
import { legendColours } from './paint.js';
import { unitsOf, unitKey, splitKey, layerOfCode } from './units.js';
import { font } from './fonts.js';
import { fillWith, parsePaint } from './patterns.js';
import { electionById, tally, arrange, paintedElections, partyOf } from './seats.js';
import './seatsrc.js'; // registers the elections built from bundled data

const INK = '#1b2430',
  MUTE = '#5b6672',
  UNCALLED = '#d9dde2';

/**
 * The elections the map has painted, as ids, and the one chosen in the Election picker (app.seatbar.el) once its
 * units are loaded, so a new election map shows its counter before anything is painted. The one shown is
 * app.seatbar.el when it is among them, else the first.
 */
export function seatElections() {
  const ids = paintedElections(app.units.keys(), splitKey, layerOfCode),
    ch = electionById(app.seatbar.el);
  if (ch && !ids.includes(ch.id) && unitsOf(ch.country, ch.layer) && !paintedOther(ch)) ids.unshift(ch.id);
  return ids;
}
// the country is painted with another layer than the chosen election's
const paintedOther = (el) => [...app.units.keys()].some((k) => splitKey(k)[0] === el.country && layerOfCode(splitKey(k)[1]) !== el.layer);
export function shownElection() {
  const ids = seatElections();
  return ids.length ? electionById(ids.includes(app.seatbar.el) ? app.seatbar.el : ids[0]) : null;
}
/** The tally of the shown election, or null (no election painted, or its units are still loading). */
export function currentTally() {
  // a map colored by a statistic (the electoral votes themselves, in classes) is not a count of who won
  if (app.stat) return null;
  const el = shownElection();
  if (!el) return null;
  const U = unitsOf(el.country, el.layer);
  if (!U) return null;
  const t = tally(
    el,
    U.feats.map((f) => ({ c: f.properties.c, props: f.properties })),
    (c) => app.units.get(unitKey(el.country, c)) || null,
    legendColours(),
    {
      // a US party's shades count together; a two-color pattern is a state with one senator of each color
      groupOf: (paint) => {
        const P = partyOf(paint);
        return P ? { key: P.key, name: P.name, tossup: P.tossup } : null;
      },
      splitOf: (paint) => {
        const q = parsePaint(paint);
        return q ? [q.bg, q.fg] : null;
      },
    },
  );
  return { el, t };
}

/** Draw the counter; returns its box {x, y, w, h} (for dragging), or null when there is nothing to count. */
export function drawSeatBar(c, w, h) {
  const B = app.seatbar;
  if (!B.show) return null;
  const cur = currentTally();
  if (!cur) return null;
  const { el, t } = cur;
  const k = B.scale || 1,
    p = 12,
    bw = Math.min(460, Math.max(300, w / k - 32)),
    barW = bw - 2 * p;
  const label = (paint) => (app.labels[paint] || '').trim();
  // a group's name: the party, else its color's legend name
  const gname = (g) => g.name || label(g.parts[0].paint);
  // the list under the bar: each group with its name and seats (and those held over), then the seats not called
  c.font = font('400', 12);
  const items = t.groups
    .map((g) => ({ paint: g.parts[0].paint, text: (gname(g) ? gname(g) + ' ' : '') + g.seats + (g.held ? ' (' + g.held + ' not up)' : '') }))
    .concat(t.uncalled ? [{ paint: null, text: 'Not called ' + t.uncalled }] : []);
  const rows = [[]];
  let rw = 0;
  for (const it of items) {
    const iw = 16 + c.measureText(it.text).width + 14;
    if (rw + iw > barW && rows[rows.length - 1].length) {
      rows.push([]);
      rw = 0;
    }
    rows[rows.length - 1].push({ ...it, x: rw });
    rw += iw;
  }
  // notes, wrapped to the bar's width
  c.font = font('400', 11);
  const notes = [];
  // every seat called and no majority: what happens next comes first
  const outcome = t.outcome === 'tie' ? el.tie || el.hung : t.outcome === 'hung' ? el.hung : '';
  for (const n of [
    outcome,
    el.note,
    t.counted !== t.total ? 'Counted ' + t.counted + ' of ' + t.total + ' ' + el.unit + ': some units are missing.' : '',
  ].filter(Boolean)) {
    let line = '';
    for (const word of n.split(' ')) {
      const next = line ? line + ' ' + word : word;
      if (line && c.measureText(next).width > barW) {
        notes.push(line);
        line = word;
      } else line = next;
    }
    if (line) notes.push(line);
  }
  const bh = p + 18 + 26 + 18 + 8 + rows.length * 18 + notes.length * 15 + p - 4;
  const W = bw * k,
    H = bh * k;
  let X, Y;
  if (B.xy) {
    X = Math.max(4, Math.min(w - W - 4, B.xy[0] * w));
    Y = Math.max(4, Math.min(h - H - 4, B.xy[1] * h));
  } else {
    X = (w - W) / 2;
    Y = B.pos === 'bc' ? h - H - 16 : 16;
  }
  c.save();
  c.translate(X, Y);
  c.scale(k, k);
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, bw, bh);
  c.strokeStyle = '#d7dde3';
  c.lineWidth = 1;
  c.strokeRect(0, 0, bw, bh);
  // title, and who has a majority
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  c.fillStyle = INK;
  c.font = font('600', 14);
  c.fillText(el.title, p, p + 8);
  c.textAlign = 'right';
  c.font = font('400', 12);
  c.fillStyle = MUTE;
  const head = {
    majority: t.winner && ((t.winner.name || label(t.winner.paint || t.winner.parts[0].paint)) || 'One color') + ' has a majority',
    tie: 'Tie',
    hung: 'No majority',
  }[t.outcome];
  c.fillText(head || t.majority + ' for a majority', bw - p, p + 8);
  // the totals of the groups at the two ends
  const bar = arrange(t),
    yNum = p + 18 + 12,
    sides = t.groups.filter((g) => !g.tossup);
  const lead = (g, align) => {
    if (!g) return;
    c.textAlign = align;
    c.font = font('700', 20);
    c.fillStyle = INK;
    c.fillText(String(g.seats), align === 'left' ? p : bw - p, yNum);
  };
  lead(sides[0], 'left');
  lead(sides[1], 'right');
  // the bar
  const yb = p + 18 + 26;
  for (const s of bar) {
    if (!s.w) continue;
    if (s.paint) fillWith(c, s.paint, app.dpr * k);
    else c.fillStyle = UNCALLED;
    // seats held over are drawn paler than those painted
    c.globalAlpha = s.held ? 0.55 : 1;
    c.fillRect(p + s.x * barW, yb, Math.max(0.5, s.w * barW), 18);
    c.globalAlpha = 1;
  }
  // the majority line
  const xm = p + (t.majority / Math.max(1, t.counted)) * barW;
  c.strokeStyle = INK;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(xm, yb - 4);
  c.lineTo(xm, yb + 22);
  c.stroke();
  // the list
  c.font = font('400', 12);
  c.textAlign = 'left';
  rows.forEach((row, i) => {
    const y = yb + 18 + 8 + i * 18 + 8;
    for (const it of row) {
      if (it.paint) fillWith(c, it.paint, app.dpr * k);
      else c.fillStyle = UNCALLED;
      c.fillRect(p + it.x, y - 6, 12, 12);
      c.fillStyle = INK;
      c.fillText(it.text, p + it.x + 16, y);
    }
  });
  c.fillStyle = MUTE;
  c.font = font('400', 11);
  notes.forEach((n, i) => c.fillText(n, p, yb + 18 + 8 + rows.length * 18 + 8 + i * 15));
  c.restore();
  return { x: X, y: Y, w: W, h: H };
}
