// The source list: one JSON file (an entry or a list of entries) per source in scripts/sources/. Every reference data
// layer has a named source, an open licence and the exact credit to print; the README sources table, the layer index
// the editor reads (credits in exports) and the downloads all come from here. See "Adding a data layer" in HANDOFF.md.
const fs = require('fs'),
  path = require('path');
const DIR = path.join(__dirname, '..', 'sources');
// the GitHub release that mirrors raw downloads, so builds do not depend on portals keeping their URLs
const MIRROR = 'https://github.com/ecumenemaps/ecumene/releases/download/data-sources/';

/** Every entry, in table order. Throws if an entry is incomplete. */
function loadSources() {
  const all = [];
  for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    for (const e of Array.isArray(j) ? j : [j]) all.push(e);
  }
  const ids = new Set();
  for (const e of all) {
    const bad = (m) => {
      throw new Error('scripts/sources: ' + (e.id || '?') + ': ' + m);
    };
    if (!e.id || !/^[a-z0-9-]+$/.test(e.id)) bad('id must be lower-case letters, digits and dashes');
    if (ids.has(e.id)) bad('duplicate id');
    ids.add(e.id);
    if (!e.title) bad('no title');
    if (!e.licence || !e.licence.name) bad('no licence');
    if (e.kind === 'layer') {
      for (const k of ['menu', 'country', 'unit', 'publisher', 'url', 'edition', 'credit', 'short']) if (!e[k]) bad('no ' + k);
      if (!e.licence.url) bad('no licence url');
      if (!e.download || !e.download.origin || !e.download.file) bad('no download');
      if (!e.fields || !e.fields.code || !e.fields.name) bad('no code and name fields');
    } else if (e.kind !== 'reference') bad('kind must be "layer" or "reference"');
    else if (!e.source) bad('no source');
  }
  return all.sort((a, b) => (a.order ?? 50) - (b.order ?? 50) || a.id.localeCompare(b.id));
}
const layers = () => loadSources().filter((e) => e.kind === 'layer');

/** Mirror asset name: the file name with the first 8 hex digits of its checksum, so an asset never changes. */
function mirrorName(e) {
  const f = e.download.file,
    i = f.lastIndexOf('.');
  return f.slice(0, i) + '-' + e.download.sha256.slice(0, 8) + f.slice(i);
}

/** The README sources table (Markdown). */
function readmeTable() {
  const rows = loadSources().map((e) => {
    const src = e.kind === 'layer' ? '[' + e.publisher + '](' + e.url + '), ' + e.edition.split(';')[0] : e.source,
      lic = e.licence.url ? '[' + e.licence.name + '](' + e.licence.url + ')' : e.licence.name;
    return '| ' + e.title + ' | ' + src + ' | ' + lic + ' |';
  });
  return ['| Data | Source | Licence |', '|---|---|---|', ...rows].join('\n');
}
const README_START = '<!-- sources:start (generated from scripts/sources by `node scripts/fetch_sources.js --readme`) -->',
  README_END = '<!-- sources:end -->';

module.exports = { loadSources, layers, mirrorName, readmeTable, README_START, README_END, MIRROR };
