// Downloads the raw files of the data layers listed in scripts/sources/ into data/src/, checking each against its
// recorded SHA-256. By default they come from the mirror (a GitHub release of this repo); the publishers' portals
// change URLs between editions, the mirror does not.
//   node scripts/fetch_sources.js            fetch from the mirror (what CI and `npm run fetch` do)
//   node scripts/fetch_sources.js --origin   fetch from the publisher instead, record the new checksum in the source
//                                            file and print the command that uploads it to the mirror
//   node scripts/fetch_sources.js --readme   rewrite the README sources table from scripts/sources
const fs = require('fs'),
  path = require('path'),
  crypto = require('crypto');
const { layers, mirrorName, readmeTable, README_START, README_END, MIRROR } = require('./lib/sources.js');
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

(async () => {
  const args = process.argv.slice(2);
  if (args.includes('--readme')) return writeReadme();
  const origin = args.includes('--origin'),
    only = args.filter((a) => !a.startsWith('--'));
  fs.mkdirSync(R('data/src'), { recursive: true });
  const upload = [];
  for (const e of layers()) {
    if (only.length && !only.includes(e.id)) continue;
    const out = R('data/src/' + e.download.file);
    if (!origin && fs.existsSync(out) && sha(fs.readFileSync(out)) === e.download.sha256) {
      console.log(e.id + ': up to date');
      continue;
    }
    if (origin) {
      const b = await get(e.download.origin),
        h = sha(b);
      fs.writeFileSync(out, b);
      if (h !== e.download.sha256) {
        // record the new checksum in the source file
        const file = fs.readdirSync(R('scripts/sources')).find((f) => f.endsWith('.json') && JSON.parse(fs.readFileSync(R('scripts/sources/' + f))).id === e.id);
        const j = JSON.parse(fs.readFileSync(R('scripts/sources/' + file)));
        j.download.sha256 = h;
        fs.writeFileSync(R('scripts/sources/' + file), JSON.stringify(j, null, 2) + '\n');
        e.download.sha256 = h;
        fs.mkdirSync(R('data/src/mirror'), { recursive: true });
        fs.copyFileSync(out, R('data/src/mirror/' + mirrorName(e)));
        upload.push(mirrorName(e));
        console.log(e.id + ': new download from the publisher, ' + (b.length / 1e6).toFixed(2) + ' MB, sha256 ' + h);
      } else console.log(e.id + ': unchanged at the publisher');
      continue;
    }
    if (!e.download.sha256) throw new Error(e.id + ': no checksum yet; run with --origin first');
    const b = await get(MIRROR + mirrorName(e));
    if (sha(b) !== e.download.sha256) throw new Error(e.id + ': the mirrored file does not match its checksum');
    fs.writeFileSync(out, b);
    console.log(e.id + ': downloaded from the mirror');
  }
  if (upload.length) {
    console.log('\nNew files for the mirror are in data/src/mirror/. Upload them (needs write access to the repo):');
    console.log('  gh release upload data-sources ' + upload.map((n) => 'data/src/mirror/' + n).join(' '));
  }
})().catch((e) => {
  console.error('Fetch failed:', e.message);
  process.exit(1);
});
