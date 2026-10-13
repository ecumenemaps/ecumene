// Downloads the Natural Earth 10m sources (public domain) used by the data builds into data/src/.
// Plain Node (18+), so it works the same on Windows, macOS and Linux.
const fs = require('fs'),
  path = require('path');
const dir = path.join(__dirname, '..', 'data', 'src');
const FILES = ['ne_10m_lakes', 'ne_10m_rivers_lake_centerlines_scale_rank', 'ne_10m_admin_1_states_provinces'];
const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
(async () => {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of FILES) {
    const r = await fetch(BASE + f + '.geojson');
    if (!r.ok) throw new Error(f + ': HTTP ' + r.status);
    fs.writeFileSync(path.join(dir, f + '.geojson'), Buffer.from(await r.arrayBuffer()));
    console.log('downloaded', f);
  }
})().catch((e) => {
  console.error('Download failed:', e.message);
  process.exit(1);
});
