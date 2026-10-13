// Overseas parts that Natural Earth's admin-0 countries keep inside the parent, split out as their own map
// units (as Natural Earth's map units do), so continent groups and the legend treat them as the places they are.
// Used by the build (scripts/build_tris.js and scripts/build.js write the split topology) and by the editor
// (persist.js paints the parts like their parent in maps saved before the split). Changing it changes the
// built fill mesh, so the CI data cache is keyed on this file too.

/** Each part: parent name, new name, ISO 3166 numeric code, and [west, south, east, north] boxes holding its islands. */
const OVERSEAS = [
  { parent: 'France', name: 'French Guiana', id: '254', boxes: [[-55, 1.5, -51, 6.5]] },
  { parent: 'France', name: 'Guadeloupe', id: '312', boxes: [[-62, 15.7, -60.9, 16.6]] },
  { parent: 'France', name: 'Martinique', id: '474', boxes: [[-61.4, 14.3, -60.7, 15]] },
  { parent: 'France', name: 'Réunion', id: '638', boxes: [[55, -21.5, 56, -20.8]] },
  { parent: 'France', name: 'Mayotte', id: '175', boxes: [[44.9, -13.1, 45.4, -12.5]] },
  // Bonaire, and Saba with Sint Eustatius
  { parent: 'Netherlands', name: 'Caribbean Netherlands', id: '535', boxes: [[-68.5, 11.9, -68.1, 12.4], [-63.4, 17.4, -62.9, 17.7]] },
];

/**
 * A copy of a world-atlas topology with the overseas parts moved out of their parents' geometries into new
 * geometries appended at the end, so every existing country keeps its index (and its id in the fill mesh).
 * Polygons are assigned by the first point of their outer ring. Throws if a part finds no polygon.
 * feature is topojson-client's, passed in so the editor bundle does not pull in a second copy.
 */
function splitOverseas(topo, feature) {
  const geoms = topo.objects.countries.geometries.map((g) => Object.assign({}, g)),
    added = [];
  for (const parent of new Set(OVERSEAS.map((p) => p.parent))) {
    const g = geoms.find((x) => x.properties && x.properties.name === parent);
    if (!g || g.type !== 'MultiPolygon') throw new Error('overseas split: ' + parent + ' is not a MultiPolygon');
    const coords = feature(topo, g).geometry.coordinates,
      keep = [],
      parts = new Map();
    g.arcs.forEach((arcs, i) => {
      const [x, y] = coords[i][0][0],
        p = OVERSEAS.find((o) => o.parent === parent && o.boxes.some((b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]));
      if (!p) keep.push(arcs);
      else {
        if (!parts.has(p)) parts.set(p, []);
        parts.get(p).push(arcs);
      }
    });
    g.arcs = keep;
    for (const p of OVERSEAS.filter((o) => o.parent === parent)) {
      const a = parts.get(p);
      if (!a) throw new Error('overseas split: no polygon found for ' + p.name);
      added.push(a.length === 1 ? { type: 'Polygon', arcs: a[0], id: p.id, properties: { name: p.name } } : { type: 'MultiPolygon', arcs: a, id: p.id, properties: { name: p.name } });
    }
  }
  return Object.assign({}, topo, { objects: Object.assign({}, topo.objects, { countries: Object.assign({}, topo.objects.countries, { geometries: geoms.concat(added) }) }) });
}

module.exports = { OVERSEAS, splitOverseas };
