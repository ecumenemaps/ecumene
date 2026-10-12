# Ecumene

Paint countries on an accurate, draggable 3D globe. An open-source alternative to MapChart for people who want globe maps, built so the output is trustworthy enough for Wikipedia-style use.

> Status: early prototype. The name is a working title, pending trademark and domain checks.

## Features (current)
- WebGL2 orthographic globe: drag, rotate, zoom (up to 40x)
- Click or Ctrl-hold-drag to fill countries; per-country colours
- Exact vector fills and exact point-in-polygon picking (small countries and islands stay clickable)
- Toggles: borders, rivers, lakes, graticule, country names
- Hover darkens the country and shows a cursor-following name tag
- Style panel (water, land, border colours; presets), undo/redo, save/share map codes, PNG export

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
