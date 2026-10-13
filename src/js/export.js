// PNG export: re-render the globe at the requested scale and composite the 2D layers on top.
import { app, redraw } from './store.js';
import { render } from './gl.js';
import { Rb } from './view.js';
import { drawObjects, drawObjectLabels, drawCountryNames, drawLegend } from './overlay.js';

let canvas = null;
export const setExportCanvas = (cv) => (canvas = cv);

export async function exportPNG(scale) {
  try {
    await document.fonts.ready;
  } catch (_) {}
  const cv = canvas,
    od = app.dpr,
    hv = app.hover;
  app.hover = 0;
  app.dpr = od * scale;
  cv.width = Math.round(app.W * app.dpr);
  cv.height = Math.round(app.H * app.dpr);
  render(Rb() * app.dpr);
  const o = document.createElement('canvas');
  o.width = cv.width;
  o.height = cv.height;
  const c = o.getContext('2d');
  c.drawImage(cv, 0, 0);
  c.setTransform(app.dpr, 0, 0, app.dpr, 0, 0);
  drawObjects(c, false);
  if (app.layers.names) drawCountryNames(c);
  drawObjectLabels(c);
  drawLegend(c, app.W, app.H);
  app.hover = hv;
  app.dpr = od;
  cv.width = Math.round(app.W * app.dpr);
  cv.height = Math.round(app.H * app.dpr);
  render(Rb() * app.dpr);
  redraw();
  return new Promise((r) => o.toBlob(r, 'image/png'));
}
