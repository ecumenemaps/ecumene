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
- Exact outlines: snap a region to real borders, either the countries painted in one colour or any set of subdivisions (states, provinces, counties; e.g. Scotland, Wales, Cornwall, Greater London), picked from a list, by group, or by clicking the map
- Label font: one setting for every label on the map and in the legend
- Legend editor: rename, recolour, reorder, remove, title and position
- Style panel (water, land, border colours; presets), undo/redo, save/share map codes, PNG export (works standalone and in the artifact)

## Build and run
Requires Node 20+.

    npm install
    npm run fetch    # download Natural Earth lakes, rivers and admin-1 sources (public domain)
    npm run data     # build data/: tris.bin (country meshes), phys.bin (lakes, rivers), admin1/ (subdivisions)
    npm run build    # write dist/: index.html (page + bundled script) and the data files it loads
    npm run serve    # serve dist/ on http://127.0.0.1:8790

`npm run dev` builds unminified with a source map and serves it. The page fetches its data, so it must be served over HTTP; any static host works (GitHub Pages, Cloudflare Pages, `python3 -m http.server -d dist`).

## Tests

    npm run test:unit   # Node's built-in test runner: groups, parsing, data decoding, spherical geometry
    npm run test:e2e    # Playwright: every feature end to end in Chromium (WebGL via SwiftShader)
    npm test            # both

The browser tests are slow on a software GPU (around 15 minutes); on a machine with a GPU they are much faster. CI runs both on every push (`.github/workflows/ci.yml`).

## Layout
- `src/template.html`: page shell, panel markup and CSS
- `src/js/`: the app as ES modules, bundled by esbuild (see `HANDOFF.md` for the module map)
- `src/groups.js`: country groups, name aliases and data parsing (shared with the build scripts and tests)
- `scripts/`: data builds (`build_tris.js`, `build_phys.js`, `build_admin1.js`, helper `lib/tri.js`), `fetch_data.sh`, and `build.js`
- `tests/unit/`, `tests/e2e/`: tests; `tests/server.js` is a minimal static server

## Data and licences
| Data | Source | Licence |
|---|---|---|
| Countries (10m) | Natural Earth via `world-atlas` | Public domain |
| Lakes, rivers (10m) | Natural Earth | Public domain |
| States and provinces (admin-1, 10m) | Natural Earth | Public domain |

Natural Earth depicts de facto boundaries and is not authoritative for disputed areas. Any future data (geoBoundaries CC BY 4.0, GADM and Eurostat non-commercial, CShapes CC BY-NC-SA, historical-basemaps GPL-3.0, OpenHistoricalMap CC0) must be checked against this project's licence before use.

## Licence
AGPL-3.0-or-later. See `LICENSE`.
