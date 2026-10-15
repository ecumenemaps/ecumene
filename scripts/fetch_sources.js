// Downloads the raw files of the data layers listed in scripts/sources/ into data/src/, checking each against its
// recorded SHA-256. By default they come from the mirror (a GitHub release of this repo); the publishers' portals
// change URLs between editions, the mirror does not.
//   node scripts/fetch_sources.js [id...]            fetch from the mirror (what CI and `npm run fetch` do)
//   node scripts/fetch_sources.js --origin [id...]   fetch from the publisher instead, record the new checksum in the
//                                                    source file and stage the file in data/src/mirror/ for upload
//   node scripts/fetch_sources.js --readme           rewrite the README sources table from scripts/sources
// A download with `extract` names one Shapefile layer inside a zip archive (OS Boundary-Line is one 737 MB archive):
// --origin keeps the archive in data/src/cache/, takes that layer out, converts it to longitude/latitude with
// mapshaper and stores it as gzipped GeoJSON, so the mirror holds only what the build uses.
const fs = require('fs'),
  path = require('path'),
  crypto = require('crypto'),
  zlib = require('zlib');
const { layers, partsOf, mirrorName, readmeTable, README_START, README_END, MIRROR } = require('./lib/sources.js');
const R = (p) => path.join(__dirname, '..', p);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ': HTTP ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

function writeReadme() {
  const f = R('README.md'),
    s = fs.readFileSync(f, 'utf8'),
    a = s.indexOf(README_START),
    b = s.indexOf(README_END);
  if (a < 0 || b < 0) throw new Error('README.md has no sources table markers');
  fs.writeFileSync(f, s.slice(0, a) + README_START + '\n' + readmeTable() + '\n' + s.slice(b));
  console.log('README sources table written');
}

/** The publisher's file for a download, after taking a Shapefile layer out of an archive if asked. */
async function fromOrigin(d) {
  if (!d.extract) return get(d.origin);
  const cache = R('data/src/cache/' + sha(Buffer.from(d.origin)).slice(0, 12) + '.zip');
  if (!fs.existsSync(cache)) {
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    console.log('  downloading ' + d.origin + ' (kept in data/src/cache/)');
    fs.writeFileSync(cache, await get(d.origin));
  }
  const { zipEntries } = require('./lib/unzip.js'),
    entries = zipEntries(fs.readFileSync(cache)),
    files = {};
  for (const ext of ['shp', 'shx', 'dbf', 'prj']) {
    const e = entries.find((x) => x.name === d.extract + '.' + ext);
    if (!e) throw new Error(d.extract + '.' + ext + ' is not in the archive');
    files['layer.' + ext] = e.data();
  }
  const ms = require('mapshaper'),
    out = await ms.applyCommands('-i layer.shp -proj wgs84 -o format=geojson precision=0.000001 out.json', files);
  // gzip with no timestamp, so the same layer gives the same bytes
  return zlib.gzipSync(Buffer.from(out['out.json']), { level: 9 });
}

/** Record a new checksum for one download of a layer in its source file. */
function recordSha(e, file, h) {
  const src = fs.readdirSync(R('scripts/sources')).find((f) => f.endsWith('.json') && JSON.parse(fs.readFileSync(R('scripts/sources/' + f))).id === e.id),
    j = JSON.parse(fs.readFileSync(R('scripts/sources/' + src)));
  for (const p of partsOf(j)) if (p.download.file === file) p.download.sha256 = h;
  fs.writeFileSync(R('scripts/sources/' + src), JSON.stringify(j, null, 2) + '\n');
}

(async () => {
  const args = process.argv.slice(2);
  if (args.includes('--readme')) return writeReadme();
  const origin = args.includes('--origin'),
    only = args.filter((a) => !a.startsWith('--'));
  fs.mkdirSync(R('data/src'), { recursive: true });
  const upload = [];
  for (const e of layers()) {
    if (only.length && !only.includes(e.id)) continue;
    for (const { download: d } of partsOf(e)) {
      const out = R('data/src/' + d.file),
        what = e.id + ' (' + d.file + ')';
      if (!origin && fs.existsSync(out) && sha(fs.readFileSync(out)) === d.sha256) {
        console.log(what + ': up to date');
        continue;
      }
      if (origin && d.manual) {
        console.log(what + ': ' + d.manual);
        continue;
      }
      if (origin) {
        const b = await fromOrigin(d),
          h = sha(b);
        fs.writeFileSync(out, b);
        if (h !== d.sha256) {
          d.sha256 = h;
          recordSha(e, d.file, h);
          fs.mkdirSync(R('data/src/mirror'), { recursive: true });
          fs.copyFileSync(out, R('data/src/mirror/' + mirrorName(d)));
          upload.push(mirrorName(d));
          console.log(what + ': new from the publisher, ' + (b.length / 1e6).toFixed(2) + ' MB, sha256 ' + h);
        } else console.log(what + ': unchanged at the publisher');
        continue;
      }
      if (!d.sha256) throw new Error(what + ': no checksum yet; run with --origin first');
      const b = await get(MIRROR + mirrorName(d));
      if (sha(b) !== d.sha256) throw new Error(what + ': the mirrored file does not match its checksum');
      fs.writeFileSync(out, b);
      console.log(what + ': downloaded from the mirror');
    }
  }
  if (upload.length) {
    console.log('\nNew files for the mirror are in data/src/mirror/. Upload them (needs write access to the repo):');
    console.log('  gh release upload data-sources ' + upload.map((n) => 'data/src/mirror/' + n).join(' '));
  }
})().catch((e) => {
  console.error('Fetch failed:', e.message);
  process.exit(1);
});
