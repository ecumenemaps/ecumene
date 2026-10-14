// Checks the overseas split (src/overseas.js) against Natural Earth's admin-0 map units, which publish French Guiana,
// Guadeloupe, Martinique, Mayotte, Réunion and the Caribbean Netherlands on their own (public domain): each part must
// hold exactly the units' polygons, and none of them may be left in France or the Netherlands.
// Usage: node scripts/check_overseas.js [path to ne_10m_admin_0_map_units.geojson]   (downloads it when no path is given)
// Prints the units' polygon centres for the fixture in tests/unit/groups.test.js. Not part of CI (it needs the network).
const fs = require('fs');
const { feature } = require('topojson-client');
const { geoCentroid, geoContains, geoDistance } = require('d3-geo');
const { OVERSEAS, splitOverseas } = require('../src/overseas.js');
const URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_map_units.geojson';
// Natural Earth's map unit code (GU_A3) for each part
const UNIT = {
  'French Guiana': 'GUF',
  Guadeloupe: 'GLP',
  Martinique: 'MTQ',
  Réunion: 'REU',
  Mayotte: 'MYT',
  'Caribbean Netherlands': 'NLY',
};
const TOL = 0.05; // degrees between polygon centres

const polys = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
const centres = (g) => polys(g).map((c) => geoCentroid({ type: 'Polygon', coordinates: c }));
const deg = (r) => (r * 180) / Math.PI;
const nearest = (a, list) => Math.min(...list.map((b) => deg(geoDistance(a, b))));

(async () => {
  const mu = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : await (await fetch(URL)).json();
  const split = splitOverseas(require('world-atlas/countries-10m.json'), feature);
  const feats = feature(split, split.objects.countries).features;
  const unit = (p) => mu.features.find((f) => f.properties.GU_A3 === UNIT[p.name]);
  let problems = 0;
  const fixture = {};
  for (const p of OVERSEAS) {
    const u = unit(p);
    if (!u) throw new Error('no Natural Earth map unit for ' + p.name);
    const ours = centres(feats.find((f) => f.properties.name === p.name).geometry),
      theirs = centres(u.geometry);
    fixture[p.name] = theirs.map((c) => c.map((v) => +v.toFixed(3)));
    const missed = theirs.filter((c) => nearest(c, ours) > TOL),
      extra = ours.filter((c) => nearest(c, theirs) > TOL && !geoContains(u, c));
    console.log(
      p.name.padEnd(22) +
        ' ours ' +
        ours.length +
        ', Natural Earth ' +
        theirs.length +
        (missed.length || extra.length ? ' DIFFER' : ' (match)'),
    );
    for (const c of missed) console.log('   not caught by the boxes: polygon at ' + c.map((v) => v.toFixed(3)).join(', '));
    for (const c of extra) console.log('   caught but not part of it: polygon at ' + c.map((v) => v.toFixed(3)).join(', '));
    problems += missed.length + extra.length;
  }
  for (const parent of new Set(OVERSEAS.map((p) => p.parent))) {
    const units = OVERSEAS.filter((p) => p.parent === parent).map(unit),
      left = centres(feats.find((f) => f.properties.name === parent).geometry).filter((c) => units.some((u) => geoContains(u, c)));
    console.log(parent + ': ' + left.length + ' polygon(s) of its overseas parts left in it');
    problems += left.length;
  }
  console.log('\nFixture for tests/unit/groups.test.js:\n' + JSON.stringify(fixture));
  console.log(problems ? '\n' + problems + ' problem(s)' : '\nThe overseas split matches Natural Earth map units.');
  process.exit(problems ? 1 : 0);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
