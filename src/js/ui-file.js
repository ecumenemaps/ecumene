// Panel: save/share (map codes and files), undo/redo, clear, PNG export.
import { app, on } from './store.js';
import { getState, setState, encode, decode, saveBlob } from './persist.js';
import { undo, redo, canUndo, canRedo } from './history.js';
import { clearFills } from './paint.js';
import { exportPNG, exportSVG } from './export.js';
import { $, note } from './util.js';

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
    if (!app.fills.size) return;
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
  $('exp').onclick = async () => {
    if (!app.ready) return;
    const blob = await exportPNG($('x2').checked ? 2 : 1);
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
      await saveBlob('globe-map.svg', await exportSVG());
      note('');
    } catch (err) {
      if (!err || err.code !== 'declined') note('Could not save the SVG: ' + (err && err.message), 1);
    }
  };
  $('snote').onchange = (e) => (app.legend.note = e.target.checked);
  on('style', () => ($('snote').checked = app.legend.note));
}
