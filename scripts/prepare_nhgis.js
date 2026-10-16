// Makes the mirrored copy of the NHGIS state boundaries (scripts/sources/us-nhgis-states-2026.json) from the
// extract downloaded by hand from https://data2.nhgis.org (a login is needed, so scripts/fetch_sources.js cannot).
//   node scripts/prepare_nhgis.js <path to nhgis0001_shape.zip> [interval metres, default 1500]
// The extract is the 24 state files for the censuses 1790 to 2020. Each is reprojected to longitude/latitude, cut
// down to a name and a year, simplified (specks under 2 km² dropped) and merged into one gzipped GeoJSON in
// data/src/: only this simplified copy is kept in the repository's mirror, never NHGIS's own files. Every unit gets
// the span of days its census map is shown for (d0, d1).
// The checksum goes into the source file and the file is staged in data/src/mirror/ for upload (see HANDOFF.md).
const fs = require('fs'),
  path = require('path'),
  zlib = require('zlib'),
  crypto = require('crypto');
const { zipEntries } = require('./lib/unzip.js');
const { mirrorName } = require('./lib/sources.js');

const [zipPath, interval = '1500'] =process.argv.slice(2);
if (!zipPath) throw new Error('usage: node scripts/prepare_nhgis.js <nhgis0001_shape.zip> [interval metres]');
const OUT = path.join(__dirname, '..', 'data/src/us-nhgis-states-2026-simplified.geojson.gz');

(async () => {
  const ms = require('mapshaper'),
    outer = zipEntries(fs.readFileSync(zipPath)),
    byYear = new Map();
  for (const e of outer) {
    const m = /_us_state_(\d{4})\.zip$/.exec(e.name);
    // the basis the file was drawn on (tl2000, tl2010, tl2020): the 2010 and 2020 files include coastal water the
    // older ones leave out, so the build compares each census only with others on the same basis
    if (m) byYear.set(+m[1], { entry: e, basis: /_shapefile_(tl\d{4})_/.exec(e.name)[1] });
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  if (years.length !== 24 || years[0] !== 1790 || years[23] !== 2020 || years.some((y, i) => y !== 1790 + 10 * i)) throw new Error('expected one state file for each census 1790-2020, found ' + years.join(', '));

  const feats = [];
  for (const y of years) {
    const files = {};
    for (const x of zipEntries(byYear.get(y).entry.data())) {
      const m = /\.(shp|shx|dbf|prj|cpg)$/.exec(x.name);
      if (m) files['layer.' + m[1]] = x.data();
    }
    // each census is simplified on its own, all its units together so their shared borders stay shared; the build
    // fits every census to the map's own coastline, so the coasts of different censuses agree again there
    const out = await ms.applyCommands('-i layer.shp -proj wgs84 -each "n = this.properties.STATENAM || this.properties.NAME || this.properties.NAME10" -filter-fields n -simplify interval=' + interval + ' keep-shapes -filter-islands min-area=2km2 -o format=geojson precision=0.0001 out.json', files);
    const next = years[years.indexOf(y) + 1];
    for (const f of JSON.parse(out['out.json']).features) {
      if (!f.geometry || !f.properties.n) throw new Error(y + ': a unit has no shape or no name');
      // shown from 1 January of its census year to the end of the year before the next census
      const n = String(f.properties.n).trim(),
        until = next ? next - 1 : y;
      feats.push({
        type: 'Feature',
        geometry: f.geometry,
        properties: { n, y, b: byYear.get(y).basis, t:/Territory$/.test(n) || n === 'Puerto Rico' ? 'Territory' : n === 'District of Columbia' ? 'Federal district' : 'State', d0: y * 1e4 + 101, d1: until * 1e4 + 1231, x: 'Borders as at the ' + y + ' census, shown for ' + (until > y ? y + ' to ' + until : 'the year ' + y) + '; changes between censuses are not shown.' },
      });
    }
    console.log(y + ': ' + feats.filter((f) => f.properties.y === y).length + ' units');
  }

  // gzip with no timestamp, so the same input gives the same bytes
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify({ type: 'FeatureCollection', features: feats })), { level: 9 });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, gz);
  const h = crypto.createHash('sha256').update(gz).digest('hex');
  console.log('wrote ' + OUT + ': ' + (gz.length / 1e6).toFixed(2) + ' MB, sha256 ' + h);
  // record the checksum in the source file and stage the file for the mirror, as fetch_sources.js --origin does
  const srcFile = path.join(__dirname, 'sources/us-nhgis-states-2026.json'),
    j = JSON.parse(fs.readFileSync(srcFile, 'utf8'));
  j.download.sha256 = h;
  fs.writeFileSync(srcFile, JSON.stringify(j, null, 2) + '\n');
  const mirror = path.join(__dirname, '../data/src/mirror');
  fs.mkdirSync(mirror, { recursive: true });
  fs.copyFileSync(OUT, path.join(mirror, mirrorName(j.download)));
  console.log('staged data/src/mirror/' + mirrorName(j.download) + '; upload it: gh release upload data-sources data/src/mirror/' + mirrorName(j.download));
  const names = new Map();
  for (const f of feats) names.set(f.properties.n, (names.get(f.properties.n) || []).concat(f.properties.y));
  for (const [n, ys] of [...names].sort()) console.log('  ' + n + ': ' + ys[0] + '..' + ys[ys.length - 1] + ' (' + ys.length + ')');
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
