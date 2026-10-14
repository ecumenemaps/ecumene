# Ecumene

Paint countries on an accurate, draggable 3D globe. Open source, and built so the output holds up as a Wikipedia-style reference map.

> Status: early prototype. The name is a working title, pending trademark and domain checks.

## Features (current)
- WebGL2 orthographic globe: drag, rotate, zoom (up to 40x)
- Click or Ctrl-hold-drag to fill countries; per-country colours
- Exact vector fills and exact point-in-polygon picking; countries too small to see (Vatican, Monaco, Nauru, Gibraltar...) get a dot you can click and paint
- Toggles: borders, rivers, graticule, country names; lakes as major (Natural Earth scalerank 0–1, 29 lakes), all, or none
- Hover darkens the country and shows a cursor-following name tag
- Fill from a pasted list of countries (aliases like USA, UK, Ivory Coast understood)
- One-click groups: EU, Eurozone, NATO, G7, G20, ASEAN, UN P5, and the continents
- Colour by data: paste `country, value` rows, pick a scale, classes and method; the legend fills itself
- Custom regions: draw polygons on the globe (true great-circle edges), edit points, set fill, opacity, outline and dashes, and name them; names are drawn on the map, in the hover tag and in the legend
- Annotations: curved or great-circle arrows (heads at one or both ends, dashes, legend entry), free text labels (size, rotation, italic) and point markers (dot, square, triangle, star) with labels
- Paint states, provinces and counties: turn on Subdivisions, point at a country and click; paint one unit, a whole region, or a constituent part such as Scotland at once
- Exact outlines: snap a region to real borders, either the countries painted in one colour or any set of subdivisions (states, provinces, counties; e.g. Scotland, Wales, Cornwall, Greater London), picked from a list, by group, or by clicking the map
- Label font: one setting for every label on the map and in the legend
- Legend editor: rename, recolour, reorder, remove, title and position
- Style panel (water, land, border colours; presets), undo/redo, save/share map codes, PNG and SVG export with a source note (data source, projection, version, date)
- Export projections: the globe as shown or as a square, world maps (Equal Earth, Robinson, Winkel tripel, Natural Earth, Mercator) and regional maps fitted to the screen (Lambert conformal conic, Albers, Lambert azimuthal equal-area), with a preview
- Wikipedia locator-map preset following WikiProject Maps' orthographic conventions (550 × 550 px, grey land, white borders and water, subject #346733, related areas #c6debd)

## Build and run
Requires Node 20+.

    npm install
    npm run fetch    # download Natural Earth lakes, rivers and admin-1 sources (public domain)
    npm run data     # build data/: tris.bin (country meshes), phys.bin (lakes, rivers), admin1/ (subdivisions)
    npm run build    # write dist/: the home page (index.html), the editor (app/) with its data, fonts, examples
    npm run serve    # serve dist/ on http://127.0.0.1:8790 (home) and /app/ (editor)
    node scripts/make_examples.js   # optional: rebuild the home-page example maps in site/examples (needs serve)

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
- `scripts/`: data builds (`build_tris.js`, `build_phys.js`, `build_admin1.js`, helpers `lib/tri.js` and `lib/cut.js`, which the editor also uses), `fetch_data.js`, and `build.js`
- `src/home/`: the home page (template and the hero globe script); `site/examples/`: example maps (state JSON and thumbnails, made by `scripts/make_examples.js`); `site/data/`: data used by examples
- `tests/unit/`, `tests/e2e/`: tests; `tests/server.js` is a minimal static server

## Data and licences
| Data | Source | Licence |
|---|---|---|
| Countries (10m) | Natural Earth via `world-atlas` | Public domain |
| Lakes, rivers (10m) | Natural Earth | Public domain |
| States and provinces (admin-1, 10m) | Natural Earth | Public domain |
| Robinson and Winkel tripel projections | `d3-geo-projection` | ISC |
| Home-page typeface: Source Serif 4 | Adobe, via `@fontsource-variable/source-serif-4` (self-hosted) | SIL OFL 1.1 |
| GDP per capita example | World Bank (NY.GDP.MKTP.CD ÷ SP.POP.TOTL, 2022) via github.com/datasets | CC BY 4.0 |

Natural Earth depicts de facto boundaries and is not authoritative for disputed areas. Any future data (geoBoundaries CC BY 4.0, GADM and Eurostat non-commercial, CShapes CC BY-NC-SA, historical-basemaps GPL-3.0, OpenHistoricalMap CC0) must be checked against this project's licence before use.

## Licence
AGPL-3.0-or-later. See `LICENSE`.
