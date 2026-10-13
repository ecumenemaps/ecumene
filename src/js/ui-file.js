// Panel: save/share (map codes and files), undo/redo, clear, PNG export.
import { app, on } from './store.js';
import { getState, setState, encode, decode, saveBlob } from './persist.js';
import { undo, redo, canUndo, canRedo } from './history.js';
import { clearFills } from './paint.js';
import { exportPNG, exportSVG, buildSVG } from './export.js';
import { PROJECTIONS } from './projections.js';
import { $, note, el } from './util.js';

const HINTS = {
  'globe-screen': 'Exactly the globe as shown.',
  'globe-world': 'The whole visible half of the globe, as a square.',
  'world-world': 'The whole world, centred on the globe\u2019s central meridian.',
  'world-screen': 'Fitted to what is on screen. Rotate or zoom the globe to choose the area.',
  'regional-screen': 'Fitted to what is on screen. Zoom in on a region first; these projections suit areas up to a continent.',
};
function initExportOptions() {
  const X = app.exportOpts,
    groups = { globe: 'Globe', world: 'World maps', regional: 'Regional maps' };
  $('xproj').replaceChildren(
    ...Object.entries(groups).map(([kind, label]) =>
      el(
        'optgroup',
        { label },
        ...Object.entries(PROJECTIONS)
          .filter(([, d]) => d.kind === kind)
          .map(([k, d]) => el('option', { value: k, textContent: d.name })),
      ),
    ),
  );
  const sync = () => {
    const kind = PROJECTIONS[X.proj].kind;
    if (kind === 'regional') X.area = 'screen';
    $('xproj').value = X.proj;
    $('xarea').value = X.area;
    $('xarea').querySelector('[value=world]').disabled = kind === 'regional';
    $('xw').value = X.width || '';
    $('xw').disabled = kind === 'globe' && X.area === 'screen';
    let h = HINTS[kind + '-' + X.area] || '';
    if (X.proj === 'mercator') h += ' Mercator greatly enlarges high latitudes; prefer an equal-area projection for world maps.';
    $('xhint').textContent = h;
  };
  $('xproj').onchange = (e) => {
    X.proj = e.target.value;
    sync();
  };
  $('xarea').onchange = (e) => {
    X.area = e.target.value;
    sync();
  };
  $('xw').onchange = (e) => {
    const v = Math.round(+e.target.value);
    X.width = Number.isFinite(v) && v >= 200 ? Math.min(8000, v) : 0;
    sync();
  };
  on('export', sync);
  sync();
}

const loaded = (skipped) => note(skipped ? 'Loaded. ' + skipped + ' name(s) were not found and were skipped.' : 'Map loaded.');

export function initFilePanel() {
  $('gc').onclick = async () => {
    try {
      const c = await encode();
      $('mc').value = c;
      $('mc').select();
      try {
        await navigator.clipboard.writeText(c);
        note('Code copied to the clipboard.');
      } catch (_) {
        note('Code ready. Copy it from the box.');
      }
    } catch (e) {
      note('Could not make a code: ' + e.message, 1);
    }
  };
  $('uc').onclick = async () => {
    try {
      loaded(setState(await decode($('mc').value)));
    } catch (e) {
      note('Could not read the code: ' + e.message, 1);
    }
  };
  $('sf').onclick = async () => {
    try {
      await saveBlob('globe-map.json', new Blob([JSON.stringify(getState(), null, 1)], { type: 'application/json' }));
      note('');
    } catch (err) {
      if (!err || err.code !== 'declined') note('Could not save the file.', 1);
    }
  };
  $('lf').onclick = () => $('fi').click();
  $('fi').onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      loaded(setState(JSON.parse(await f.text())));
    } catch (err) {
      note('Could not read the file: ' + err.message, 1);
    }
  };
  $('un').onclick = undo;
  $('re').onclick = redo;
  on('history', () => {
    $('un').disabled = !canUndo();
    $('re').disabled = !canRedo();
  });
  // clearing needs a second click within 3 s
  let armed = 0;
  $('clr').onclick = (e) => {
    if (!app.fills.size && !app.units.size) return;
    if (!armed) {
      armed = setTimeout(() => {
        armed = 0;
        e.target.textContent = 'Clear all colors';
      }, 3000);
      e.target.textContent = 'Click again to clear';
      return;
    }
    clearTimeout(armed);
    armed = 0;
    e.target.textContent = 'Clear all colors';
    clearFills();
  };
  initExportOptions();
  $('exp').onclick = async () => {
    if (!app.ready) return;
    note('Making PNG…');
    let blob;
    try {
      blob = await exportPNG($('x2').checked ? 2 : 1, app.exportOpts);
    } catch (err) {
      note('Could not make the image: ' + (err && err.message), 1);
      return;
    }
    try {
      await saveBlob('globe-map.png', blob);
      note('');
    } catch (err) {
      if (!err || err.code !== 'declined') note('Could not save the image.', 1);
    }
  };
  $('exs').onclick = async () => {
    if (!app.ready) return;
    try {
      note('Building SVG…');
      await saveBlob('globe-map.svg', await exportSVG(app.exportOpts));
      note('');
    } catch (err) {
      if (!err || err.code !== 'declined') note('Could not save the SVG: ' + (err && err.message), 1);
    }
  };
  $('snote').onchange = (e) => (app.legend.note = e.target.checked);
  let url = null;
  $('xprev').onclick = async () => {
    if (!app.ready) return;
    note('Building preview…');
    try {
      const svg = await buildSVG(app.exportOpts);
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      $('ximg').src = url;
      const m = /width="(\d+)" height="(\d+)"/.exec(svg);
      $('xinfo').textContent = PROJECTIONS[app.exportOpts.proj].name + ' · ' + m[1] + ' × ' + m[2] + ' px · SVG ' + Math.round(svg.length / 1024) + ' KB';
      $('xdlg').showModal();
      note('');
    } catch (err) {
      note('Could not build the preview: ' + (err && err.message), 1);
    }
  };
  $('xclose').onclick = () => $('xdlg').close();
  on('style', () => ($('snote').checked = app.legend.note));
  on('legendopts', () => ($('snote').checked = app.legend.note));
}
