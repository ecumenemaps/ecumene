// Home page: an atlas-plate globe you can turn, with a live caption, plus "continue your map".
import { geoOrthographic, geoPath, geoGraticule10 } from 'd3-geo';
import { feature, mesh, neighbors } from 'topojson-client';

const $ = (id) => document.getElementById(id);
const css = (k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim();

// ---- continue the map saved in this browser
try {
  const s = JSON.parse(localStorage.getItem('globeMap1') || 'null');
  const used = s && ((s.f && s.f.length) || (s.g && s.g.length));
  if (used) {
    $('cont').hidden = false;
    $('newnote').hidden = false;
  }
} catch (_) {}

// ---- the globe
const cv = $('globe'),
  c = cv.getContext('2d'),
  cap = $('cap');
const proj = geoOrthographic().clipAngle(90).precision(0.3);
const path = geoPath(proj, c);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let rot = [-15, -22],
  countries = null,
  borders = null,
  tint = [],
  size = 0,
  dragging = null,
  last = performance.now();

// Oceans lettered the way atlases do, in spaced italic along their middle.
const OCEANS = [
  ['Atlantic Ocean', [-32, 18]],
  ['Pacific Ocean', [-150, 5]],
  ['Pacific Ocean', [170, 18]],
  ['Indian Ocean', [78, -22]],
  ['Arctic Ocean', [10, 84]],
  ['Southern Ocean', [40, -62]],
];

function fit() {
  const r = cv.getBoundingClientRect(),
    dpr = Math.min(2, devicePixelRatio || 1);
  size = r.width;
  cv.width = Math.round(r.width * dpr);
  cv.height = Math.round(r.width * dpr);
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  proj.translate([size / 2, size / 2]).scale(size / 2 - 3);
  draw();
}
const fmt = (v, pos, neg) => Math.abs(Math.round(v)) + '° ' + (v >= 0 ? pos : neg);
function draw() {
  if (!size) return;
  proj.rotate(rot);
  const ink = css('--ink'),
    sea = css('--sea'),
    tints = [css('--t1'), css('--t2'), css('--t3'), css('--t4')];
  c.clearRect(0, 0, size, size);
  c.beginPath();
  path({ type: 'Sphere' });
  c.fillStyle = sea;
  c.fill();
  c.beginPath();
  path(geoGraticule10());
  c.strokeStyle = ink;
  c.globalAlpha = 0.16;
  c.lineWidth = 0.6;
  c.stroke();
  c.globalAlpha = 1;
  if (countries) {
    countries.forEach((f, i) => {
      c.beginPath();
      path(f);
      c.fillStyle = tints[tint[i]];
      c.fill();
    });
    c.beginPath();
    path(borders);
    c.strokeStyle = ink;
    c.globalAlpha = 0.45;
    c.lineWidth = 0.55;
    c.stroke();
    c.globalAlpha = 1;
  }
  // the central meridian, ruled in survey red, as on a projection diagram
  c.beginPath();
  path({ type: 'LineString', coordinates: [[-rot[0], -89.9], [-rot[0], 0], [-rot[0], 89.9]] });
  c.strokeStyle = css('--red');
  c.lineWidth = 1;
  c.stroke();
  c.font = 'italic 400 ' + Math.max(11, size / 44) + 'px "Source Serif", Georgia, serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = ink;
  c.globalAlpha = 0.62;
  const centre = [-rot[0], -rot[1]];
  for (const [name, ll] of OCEANS) {
    const d = Math.acos(
      Math.max(-1, Math.min(1, Math.sin((ll[1] * Math.PI) / 180) * Math.sin((centre[1] * Math.PI) / 180) +
        Math.cos((ll[1] * Math.PI) / 180) * Math.cos((centre[1] * Math.PI) / 180) * Math.cos(((ll[0] - centre[0]) * Math.PI) / 180))),
    );
    if (d > 1.15) continue;
    const p = proj(ll);
    c.letterSpacing = '0.18em';
    c.fillText(name, p[0], p[1]);
  }
  c.letterSpacing = '0px';
  c.globalAlpha = 1;
  c.beginPath();
  path({ type: 'Sphere' });
  c.strokeStyle = ink;
  c.lineWidth = 1.2;
  c.stroke();
  const lon = ((((-rot[0] + 180) % 360) + 360) % 360) - 180;
  cap.textContent = 'Orthographic projection, centred on ' + fmt(lon, 'E', 'W') + ' ' + fmt(-rot[1], 'N', 'S');
}
function tick(t) {
  const dt = Math.min(64, t - last);
  last = t;
  if (!dragging && !reduce) {
    rot = [rot[0] + dt * 0.004, rot[1]];
    draw();
  }
  requestAnimationFrame(tick);
}

cv.addEventListener('pointerdown', (e) => {
  dragging = [e.clientX, e.clientY];
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const k = 90 / (size / 2);
  rot = [rot[0] + (e.clientX - dragging[0]) * k, Math.max(-80, Math.min(80, rot[1] - (e.clientY - dragging[1]) * k))];
  dragging = [e.clientX, e.clientY];
  draw();
});
const stop = () => (dragging = null);
cv.addEventListener('pointerup', stop);
cv.addEventListener('pointercancel', stop);
// arrow keys turn the globe too
cv.addEventListener('keydown', (e) => {
  const d = { ArrowLeft: [8, 0], ArrowRight: [-8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] }[e.key];
  if (!d) return;
  e.preventDefault();
  rot = [rot[0] + d[0], Math.max(-80, Math.min(80, rot[1] + d[1]))];
  draw();
});

new ResizeObserver(fit).observe(cv);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
fetch('home/countries-110m.json')
  .then((r) => r.json())
  .then((topo) => {
    const geoms = topo.objects.countries;
    countries = feature(topo, geoms).features;
    borders = mesh(topo, geoms, (a, b) => a !== b);
    // four-colour the countries greedily from their neighbours, like a political atlas plate
    const nb = neighbors(geoms.geometries);
    const order = countries.map((_, i) => i).sort((a, b) => nb[b].length - nb[a].length);
    tint = new Array(countries.length).fill(0);
    const done = new Set();
    for (const i of order) {
      const used = new Set(nb[i].filter((j) => done.has(j)).map((j) => tint[j]));
      let k = 0;
      while (used.has(k) && k < 3) k++;
      tint[i] = k;
      done.add(i);
    }
    draw();
  })
  .catch(() => {});
document.fonts && document.fonts.ready.then(draw);
requestAnimationFrame(tick);
