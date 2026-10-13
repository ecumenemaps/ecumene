// 2D canvas layer over the globe: map objects, names, legend, and editing/picking feedback.
// The same functions draw into the exported PNG (with ui=false).
import { geoPath, geoDistance, geoInterpolate } from 'd3-geo';
import { app } from './store.js';
import { geo } from './data.js';
import { proj, setProj, pxPerRad, isFlat, geoAt, onFront, tinyMarkers, MARK_R } from './view.js';
import { arrowLine } from './shapes.js';
import { isRegion, isArea, areaGeo, areaAnchor } from './objects.js';
import { legendColours } from './paint.js';
import { font } from './fonts.js';
import { D, darker, halo, hx, lum } from './util.js';

const INK = '#1b2430';

function strokedText(c, t, x, y, fill, weight, px, italic) {
  c.font = font(weight, px, italic);
  c.lineJoin = 'round';
  c.lineWidth = Math.max(3, px / 4);
  c.strokeStyle = halo(fill);
  c.globalAlpha = 0.9;
  c.strokeText(t, x, y);
  c.globalAlpha = 1;
  c.fillStyle = fill;
  c.fillText(t, x, y);
}

function headAt(c, tip, prev, size, col) {
  if (!onFront(tip)) return;
  const a = proj(tip),
    b = proj(prev),
    ang = Math.atan2(a[1] - b[1], a[0] - b[0]);
  c.save();
  c.translate(a[0], a[1]);
  c.rotate(ang);
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(-size, -size * 0.55);
  c.lineTo(-size * 0.78, 0);
  c.lineTo(-size, size * 0.55);
  c.closePath();
  c.fillStyle = col;
  c.fill();
  c.restore();
}
function drawArrow(c, path, r) {
  if (r.pts.length < 2) return;
  const line = arrowLine(r.pts, r.sm),
    hs = 6 + r.aw * 2.6;
  c.beginPath();
  path({ type: 'LineString', coordinates: line });
  c.lineWidth = r.aw;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = r.col;
  c.setLineDash(r.dash ? [r.aw * 3, r.aw * 2.2] : []);
  c.stroke();
  c.setLineDash([]);
  if (r.head === 'end' || r.head === 'both') headAt(c, line[line.length - 1], line[Math.max(0, line.length - 3)], hs, r.col);
  if (r.head === 'both') headAt(c, line[0], line[Math.min(line.length - 1, 2)], hs, r.col);
}
function drawMarker(c, r) {
  const g = r.pts[0];
  if (!onFront(g)) return;
  const p = proj(g),
    s = r.ms;
  c.save();
  c.translate(p[0], p[1]);
  c.beginPath();
  if (r.sym === 'square') c.rect(-s, -s, 2 * s, 2 * s);
  else if (r.sym === 'triangle') {
    c.moveTo(0, -s * 1.2);
    c.lineTo(s * 1.1, s * 0.8);
    c.lineTo(-s * 1.1, s * 0.8);
    c.closePath();
  } else if (r.sym === 'star') {
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? s * 0.5 : s * 1.3,
        a = -Math.PI / 2 + (i * Math.PI) / 5;
      c.lineTo(rr * Math.cos(a), rr * Math.sin(a));
    }
    c.closePath();
  } else c.arc(0, 0, s, 0, 7);
  c.fillStyle = r.col;
  c.fill();
  c.lineWidth = 1.5;
  c.strokeStyle = lum(r.col) > 0.5 ? '#101820' : '#ffffff';
  c.stroke();
  const t = r.label.trim();
  if (t) {
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    strokedText(c, t, s + 5, 0, INK, '600', r.fs);
  }
  c.restore();
}
function drawText(c, r) {
  const g = r.pts[0],
    t = r.label.trim();
  if (!t || !onFront(g)) return;
  const p = proj(g);
  c.save();
  c.translate(p[0], p[1]);
  c.rotate(r.rot * D);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  strokedText(c, t, 0, 0, r.col, '600', r.fs, r.it);
  c.restore();
}

/** Region fills and outlines, arrows; with ui, also picker and editing feedback. */
export function drawObjects(c, ui) {
  setProj();
  const path = geoPath(proj, c);
  if (app.layers.regions)
    for (const r of app.objects) {
      if (r.t === 'arrow') {
        drawArrow(c, path, r);
        continue;
      }
      if (!isArea(r)) continue;
      const g = areaGeo(r);
      if (!g) continue;
      c.beginPath();
      path(g);
      c.globalAlpha = r.op;
      c.fillStyle = r.col;
      c.fill();
      c.globalAlpha = 1;
      if (r.lw > 0) {
        c.setLineDash(r.dash ? [7, 5] : []);
        c.lineWidth = r.lw;
        c.lineJoin = 'round';
        c.strokeStyle = darker(r.col);
        c.stroke();
        c.setLineDash([]);
      }
    }
  if (!ui) return;
  const pk = app.pick;
  if (pk && pk.feats) {
    c.beginPath();
    path(pk.mesh);
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(20,30,40,.75)';
    c.stroke();
    for (const f of pk.feats)
      if (pk.sel.has(f.id)) {
        c.beginPath();
        path(f);
        c.globalAlpha = 0.55;
        c.fillStyle = app.active;
        c.fill();
        c.globalAlpha = 1;
      }
    if (pk.hov) {
      c.beginPath();
      path(pk.hov);
      c.lineWidth = 2.2;
      c.strokeStyle = '#111';
      c.stroke();
    }
  }
  const dot = (g, rad, fill) => {
    if (!onFront(g)) return;
    const p = proj(g);
    c.beginPath();
    c.arc(p[0], p[1], rad, 0, 7);
    c.fillStyle = fill;
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = INK;
    c.stroke();
  };
  const dashed = (g) => {
    c.beginPath();
    path(g);
    c.lineWidth = 2;
    c.strokeStyle = '#ffffff';
    c.setLineDash([4, 3]);
    c.stroke();
    c.setLineDash([]);
  };
  const r = app.objects[app.sel];
  if (r && r.t === 'shape') {
    const g = areaGeo(r);
    if (g) dashed(g);
  } else if (r && !app.drawing) {
    const closed = isRegion(r);
    if (r.pts.length > 1) {
      dashed({ type: 'LineString', coordinates: closed ? r.pts.concat([r.pts[0]]) : r.pts });
      for (let i = 0; i < (closed ? r.pts.length : r.pts.length - 1); i++)
        dot(geoInterpolate(r.pts[i], r.pts[(i + 1) % r.pts.length])(0.5), 3.5, 'rgba(255,255,255,.7)');
    }
    r.pts.forEach((g) => dot(g, 5.5, '#ffffff'));
  }
  const d = app.drawing;
  if (d) {
    const m = geoAt(app.mx, app.my);
    if (d.pts.length) {
      c.beginPath();
      path({ type: 'LineString', coordinates: m ? d.pts.concat([m]) : d.pts });
      c.lineWidth = 2;
      c.strokeStyle = d.col;
      c.stroke();
    }
    d.pts.forEach((g, i) => dot(g, d.t === 'region' && i === 0 && d.pts.length > 2 ? 7 : 5, i === 0 ? d.col : '#ffffff'));
  }
}

/** Region names, then markers and text labels: these go on top of everything else. */
export function drawObjectLabels(c) {
  if (!app.layers.regions) return;
  setProj();
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  for (const r of app.objects) {
    if (!isArea(r)) continue;
    const t = r.label.trim();
    if (!r.sn || !t) continue;
    const a = areaAnchor(r);
    if (!a || !onFront(a)) continue;
    const p = proj(a);
    strokedText(c, t, p[0], p[1], darker(r.col), '700', r.fs);
  }
  for (const r of app.objects) {
    if (r.t === 'marker') drawMarker(c, r);
    else if (r.t === 'text') drawText(c, r);
  }
}

/** Fill and edge of a tiny-country marker: the country's colour when painted, otherwise land with a border-coloured edge. */
export function markerPaint(m) {
  const col = app.fills.get(m.n);
  return col ? { fill: col, edge: darker(col) } : { fill: app.style.land, edge: app.style.border };
}
// the globe's hover shading (see gl.js): light colours darken, dark ones lighten
function hoverShade(h, k) {
  const up = lum(h) <= 0.45,
    ch = (v) => Math.round(up ? v + (255 - v) * k : v * (1 - k));
  return '#' + hx(h).map((v) => ch(v).toString(16).padStart(2, '0')).join('');
}
/** Dots for countries too small to see at this zoom; ui adds the hover style. */
export function drawTinyMarkers(c, ui) {
  const H = app.hoverStyle;
  for (const m of tinyMarkers()) {
    const k = markerPaint(m),
      hov = ui && m.id === app.hover;
    c.beginPath();
    c.arc(m.p[0], m.p[1], MARK_R, 0, 7);
    c.fillStyle = hov && H.dark ? hoverShade(k.fill, H.amt) : k.fill;
    c.fill();
    c.lineWidth = hov && H.outline ? 2 : 1;
    c.strokeStyle = hov && H.outline ? INK : k.edge;
    c.stroke();
  }
}

/** Country names, largest first, skipping any that would overlap or not fit. */
export function drawCountryNames(c) {
  setProj();
  const R = pxPerRad(),
    rr = proj.rotate(),
    cen = [-rr[0], -rr[1]],
    flat = isFlat(),
    placed = [],
    S = app.style,
    haloCol = halo(S.label);
  c.font = font('600', 11);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.lineWidth = 3;
  for (const l of geo.labelPts) {
    if (!flat && geoDistance(l.c, cen) > 1.15) continue;
    const w = c.measureText(l.n).width;
    if (Math.sqrt(l.a) * R < w * 0.8) continue;
    const p = proj(l.c);
    if (!p || !p.every(Number.isFinite)) continue;
    const box = [p[0] - w / 2 - 2, p[1] - 8, p[0] + w / 2 + 2, p[1] + 8];
    if (placed.some((q) => box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1])) continue;
    placed.push(box);
    c.strokeStyle = haloCol;
    c.globalAlpha = 0.85;
    c.strokeText(l.n, p[0], p[1]);
    c.globalAlpha = 1;
    c.fillStyle = S.label;
    c.fillText(l.n, p[0], p[1]);
  }
}

/** Small source line along the bottom edge, on the side away from the legend. */
export function drawSourceNote(c, w, h, text, legend) {
  // move to the left when the legend sits over the bottom-right corner
  const left = !!legend && legend.x + legend.w > w * 0.55 && legend.y + legend.h > h - 40;
  c.font = font('400', 10);
  c.textAlign = left ? 'left' : 'right';
  c.textBaseline = 'bottom';
  const x = left ? 10 : w - 10,
    y = h - 6,
    bg = app.style.bg;
  c.lineJoin = 'round';
  c.lineWidth = 3;
  c.strokeStyle = bg;
  c.globalAlpha = 0.85;
  c.strokeText(text, x, y);
  c.globalAlpha = 1;
  c.fillStyle = lum(bg) > 0.5 ? '#5b6672' : '#aab4bf';
  c.fillText(text, x, y);
}

/** Legend box with named colours, named regions and named arrows. */
export function drawLegend(c, w, h) {
  const L = app.legend;
  if (!L.show) return null;
  const items = legendColours()
    .map((col) => ({ col, label: (app.labels[col] || '').trim() }))
    .filter((x) => x.label);
  if (app.layers.regions)
    for (const r of app.objects) {
      const label = r.label.trim();
      if (!label) continue;
      if (isArea(r) && areaGeo(r)) items.push({ col: r.col, label, reg: r });
      else if (r.t === 'arrow' && r.pts.length > 1) items.push({ col: r.col, label, arr: r });
    }
  if (!items.length) return null;
  const title = L.title.trim();
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.font = font('400', 14);
  let mw = 0;
  for (const x of items) mw = Math.max(mw, c.measureText(x.label).width + 26);
  if (title) {
    c.font = font('600', 14);
    mw = Math.max(mw, c.measureText(title).width);
  }
  const p = 12,
    lh = 24,
    th = title ? 26 : 0,
    k = L.scale || 1,
    bw = mw + p * 2,
    bh = items.length * lh + p * 2 - 6 + th;
  // position: dragged (fractions of the frame, so it carries over to exports of any size) or a corner
  const W = bw * k,
    H = bh * k;
  let X, Y;
  if (L.xy) {
    X = Math.max(4, Math.min(w - W - 4, L.xy[0] * w));
    Y = Math.max(4, Math.min(h - H - 4, L.xy[1] * h));
  } else {
    X = L.pos[1] === 'r' ? w - W - 16 : 16;
    Y = L.pos[0] === 't' ? 16 : h - H - 16;
  }
  c.save();
  c.translate(X, Y);
  c.scale(k, k);
  const bx = 0,
    by = 0;
  c.fillStyle = '#ffffff';
  c.fillRect(bx, by, bw, bh);
  c.strokeStyle = '#d7dde3';
  c.lineWidth = 1;
  c.strokeRect(bx, by, bw, bh);
  c.fillStyle = INK;
  if (title) {
    c.font = font('600', 14);
    c.fillText(title, bx + p, by + p + 6);
  }
  c.font = font('400', 14);
  items.forEach((x, i) => {
    const y = by + p + th + i * lh;
    if (x.arr) {
      const a = x.arr;
      c.strokeStyle = a.col;
      c.lineWidth = Math.min(4, a.aw);
      c.setLineDash(a.dash ? [4, 3] : []);
      c.beginPath();
      c.moveTo(bx + p, y + 8);
      c.lineTo(bx + p + 11, y + 8);
      c.stroke();
      c.setLineDash([]);
      c.beginPath();
      c.moveTo(bx + p + 17, y + 8);
      c.lineTo(bx + p + 9, y + 3.5);
      c.lineTo(bx + p + 9, y + 12.5);
      c.closePath();
      c.fillStyle = a.col;
      c.fill();
    } else {
      c.globalAlpha = x.reg ? Math.max(0.15, x.reg.op) : 1;
      c.fillStyle = x.col;
      c.fillRect(bx + p, y, 16, 16);
      c.globalAlpha = 1;
      if (x.reg) {
        c.setLineDash(x.reg.dash ? [3, 2] : []);
        c.lineWidth = Math.max(1, Math.min(2, x.reg.lw));
        c.strokeStyle = darker(x.col);
      } else {
        c.lineWidth = 1;
        c.strokeStyle = 'rgba(0,0,0,.25)';
      }
      c.strokeRect(bx + p, y, 16, 16);
      c.setLineDash([]);
    }
    c.fillStyle = INK;
    c.fillText(x.label, bx + p + 26, y + 8);
  });
  c.restore();
  return { x: X, y: Y, w: W, h: H };
}
