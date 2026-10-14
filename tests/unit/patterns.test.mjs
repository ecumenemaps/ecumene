// Pattern paints (src/js/patterns.js): the string form, validation, and the SVG patterns exports use.
import test from 'node:test';
import assert from 'node:assert';
import {
  PATTERNS,
  PATTERN_TYPES,
  parsePaint,
  isPattern,
  patternPaint,
  paintOk,
  baseColor,
  withBackground,
  svgPattern,
} from '../../src/js/patterns.js';

test('pattern paints read, write and validate', () => {
  const v = patternPaint('diag', '#E4572E', '#222222');
  assert.strictEqual(v, 'p:diag:#e4572e:#222222');
  assert.deepStrictEqual(parsePaint(v), { type: 'diag', bg: '#e4572e', fg: '#222222' });
  assert.ok(isPattern(v) && !isPattern('#e4572e'));
  for (const ok of ['#e4572e', '#E4572E', v, 'P:DOTS:#FFFFFF:#000000']) assert.ok(paintOk(ok), ok);
  for (const bad of ['red', 'p:zigzag:#e4572e:#222222', 'p:diag:#e4572e', 'p:diag:#e4572e:#22', '<svg>', null, 5])
    assert.ok(!paintOk(bad), String(bad));
  assert.strictEqual(baseColor(v), '#e4572e');
  assert.strictEqual(baseColor('#3d8bd9'), '#3d8bd9');
  assert.strictEqual(withBackground(v, '#3d8bd9'), 'p:diag:#3d8bd9:#222222');
  assert.strictEqual(withBackground('#e4572e', '#3d8bd9'), '#3d8bd9');
});

test('every pattern has an SVG <pattern> with its tile size, background and ink', () => {
  const ids = new Set();
  for (const t of PATTERN_TYPES) {
    const s = svgPattern(patternPaint(t, '#e4572e', '#123456')),
      T = PATTERNS[t].T;
    assert.match(s.id, /^pat-[a-z]+-e4572e-123456$/);
    assert.ok(s.svg.startsWith('<pattern id="' + s.id + '" patternUnits="userSpaceOnUse" width="' + T + '" height="' + T + '">'), t);
    assert.ok(s.svg.includes('fill="#e4572e"') && s.svg.includes('#123456'), t + ' has both colors');
    assert.ok(s.svg.endsWith('</pattern>'));
    ids.add(s.id);
  }
  assert.strictEqual(ids.size, PATTERN_TYPES.length);
  // the globe's shader numbers patterns 1..8 in this order (gl.js FS_FILL mask)
  assert.deepStrictEqual(PATTERN_TYPES, ['diag', 'diagw', 'horiz', 'vert', 'cross', 'dots', 'check', 'fine']);
});
