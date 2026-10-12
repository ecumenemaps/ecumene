# Ecumene

Paint countries on an accurate, draggable 3D globe. An open-source alternative to MapChart for people who want globe maps, built so the output is trustworthy enough for Wikipedia-style use.

> Status: early prototype. The name is a working title, pending trademark and domain checks.

## Features (current)
- WebGL2 orthographic globe: drag, rotate, zoom (up to 40x)
- Click or Ctrl-hold-drag to fill countries; per-country colours
- Exact vector fills and exact point-in-polygon picking (small countries and islands stay clickable)
- Toggles: borders, rivers, lakes, graticule, country names
- Hover darkens the country and shows a cursor-following name tag
- Fill from a pasted list of countries (aliases like USA, UK, Ivory Coast understood)
- One-click groups: EU, Eurozone, NATO, G7, G20, ASEAN, UN P5, and the continents
- Colour by data: paste `country, value` rows, pick a scale, classes and method; the legend fills itself
- Custom regions: draw polygons on the globe (true great-circle edges), edit points, set fill, opacity, outline and dashes, and name them; names are drawn on the map, in the hover tag and in the legend
- Annotations: curved or great-circle arrows (heads at one or both ends, dashes, legend entry), free text labels (size, rotation, italic) and point markers (dot, square, triangle, star) with labels
- Region from countries: turn the countries painted in one colour into an editable region outline
- Legend editor: rename, recolour, reorder, remove, title and position
- Style panel (water, land, border colours; presets), undo/redo, save/share map codes, PNG export (works standalone and in the artifact)

## Build
Requires Node 20+.

    npm install
    npm run fetch    # download Natural Earth lakes and rivers (public domain)
    npm run data     # triangulate countries and pack lakes/rivers into data/*.b64
    npm run build    # writes dist/index.html, a single self-contained page

Open `dist/index.html` in a browser. No server is needed.

## Layout
- `src/template.html` page shell and UI; `src/app.js` renderer and app logic; `src/tri.js` polygon triangulation helper
- `scripts/build_tris.js` country meshes; `scripts/build_phys.js` lakes and rivers; `scripts/build.js` assembles the page

## Data and licences
| Data | Source | Licence |
|---|---|---|
| Countries (10m) | Natural Earth via `world-atlas` | Public domain |
| Lakes, rivers (10m) | Natural Earth | Public domain |

Natural Earth depicts de facto boundaries and is not authoritative for disputed areas. Any future data (geoBoundaries CC BY 4.0, GADM and Eurostat non-commercial, CShapes CC BY-NC-SA, historical-basemaps GPL-3.0, OpenHistoricalMap CC0) must be checked against this project's licence before use.

## Licence
AGPL-3.0-or-later. See `LICENSE`.
