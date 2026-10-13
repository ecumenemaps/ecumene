// Unit tests for the SVG recording context used by vector export.
import test from 'node:test';
import assert from 'node:assert';
import { geoPath, geoOrthographic } from 'd3-geo';
import { SvgContext, parseFont, paint } from '../../src/js/svgctx.js';

test('paths are transformed, rounded, relative and closed', () => {
  const c = new SvgContext();
  c.translate(10, 20);
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(5.04, 0);
  c.lineTo(5.04, 5);
  c.closePath();
  c.fillStyle = '#ff0000';
  c.fill();
  assert.match(c.toString(100, 100), /<path d="M10 20l5 0l0 5Z" fill="#ff0000"\/>/);
});

test('points closer than the tolerance are thinned but the end point is kept', () => {
  const c = new SvgContext();
  c.beginPath();
  c.moveTo(0, 0);
  for (let i = 1; i <= 10; i++) c.lineTo(i * 0.1, 0);
  c.stroke();
  const d = /d="([^"]+)"/.exec(c.toString(10, 10))[1];
  assert.strictEqual(d, 'M0 0l0.4 0l0.4 0l0.2 0');
});

test('rgba colours become hex plus opacity, combined with globalAlpha', () => {
  assert.deepStrictEqual(paint('rgba(0,0,0,.25)'), { c: '#000000', a: 0.25 });
  const c = new SvgContext();
  c.globalAlpha = 0.5;
  c.fillStyle = 'rgba(255,255,255,0.5)';
  c.fillRect(0, 0, 4, 4);
  assert.match(c.toString(4, 4), /fill="#ffffff" fill-opacity="0.25"/);
});

test('text keeps font, alignment and escapes markup', () => {
  assert.deepStrictEqual(parseFont('italic 600 14px "Noto Sans",sans-serif'), {
    style: 'italic',
    weight: '600',
    size: 14,
    family: '"Noto Sans",sans-serif',
  });
  const c = new SvgContext();
  c.font = '700 12px Georgia,serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.translate(5, 6);
  c.fillText('A & <B>', 1, 2);
  const s = c.toString(10, 10);
  assert.match(s, /<text x="6" y="8" font-family="Georgia,serif" font-size="12" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="#000000">A &amp; &lt;B&gt;<\/text>/);
});

test('d3 geoPath draws a clipped hemisphere through the context', () => {
  const c = new SvgContext(),
    proj = geoOrthographic().clipAngle(90).translate([50, 50]).scale(40);
  c.beginPath();
  geoPath(proj, c)({ type: 'Sphere' });
  c.fill();
  const s = c.toString(100, 100);
  assert.match(s, /<path d="M/);
  assert.ok(s.split('l').length > 30, 'sphere outline has many segments');
});

test('tagged attributes go on the next element only', () => {
  const c = new SvgContext();
  c.tag({ id: 'country-France', 'data-name': 'France' });
  c.fillRect(0, 0, 1, 1);
  c.fillRect(0, 0, 1, 1);
  const s = c.toString(1, 1);
  assert.strictEqual(s.split('data-name="France"').length, 2);
});
