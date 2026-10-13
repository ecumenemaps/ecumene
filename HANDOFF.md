# Handoff notes

Context for anyone (or any session) picking this up. See README for build and test commands.

## Module map (`src/js/`)
| Module | Role |
|---|---|
| `main.js` | Entry: WebGL setup, data load, panel wiring, frame function, `window.ecumene` API |
| `store.js` | The shared `app` state object, style presets, `redraw()` and a tiny event bus (`on`/`emit` for `legend`, `objects`, `history`, `style`) |
| `data.js` | Fetches `data/countries.json`, `data/tris.bin`, `data/phys.bin`, `admin1/index.json`; country lookups; exact picking `idAtLL` |
| `decode.js` | Pure decoders for the packed binary data (unit tested) |
| `gl.js` | WebGL2 renderer: ocean and shading pass, fill mesh with a 256-entry palette texture, instanced lines |
| `view.js` | Orthographic camera: screen to lon/lat, zoom, animation; which small-country markers are visible (`tinyMarkers`) and picking that checks them first (`idAtPx`) |
| `shapes.js` | Pure spherical geometry: ring winding, label anchors, smooth curves (unit tested) |
| `objects.js` | Map objects model (regions, exact outlines, arrows, text, markers), outline geometry cache, hit tests |
| `editing.js` | Drawing mode, selection, creating exact outlines, reorder and delete |
| `picker.js` | Subdivision picker (groups, list, map clicks) |
| `overlay.js` | 2D canvas drawing for objects, names, legend, editing handles; reused by PNG and SVG export |
| `paint.js` | Country fills, recolour, legend colour order |
| `history.js` | Undo and redo (snapshots of fills and objects) |
| `persist.js` | `getState`/`setState` (validated), map codes `GM1.`, downloads, autosave |
| `fonts.js` | Label fonts; web fonts load only when chosen |
| `input.js` | Pointer, wheel, keyboard, hover tag |
| `ui-*.js` | Panels: paint (palette, search, lists, data), style, legend, objects, file |
| `export.js` | PNG export; SVG export (vector layers in named groups, one path per country with `data-name`, metadata in `<desc>`); source note text |
| `projections.js` | Export projections and fitting: globe as shown or square, whole-world flat maps centred on the globe's meridian, regional maps fitted to points sampled from the visible globe (conic standard parallels at 1/6 and 5/6 of the latitude span) |
| `ui-modes.js` | Panel modes (Paint, Data, Draw, Style, Legend, Export): rail on desktop, bottom tabs and a resizable sheet on phones; keys 1–6; remembers the last mode; selecting an object switches to Draw. `window.ecumene.mode(m)` for tests |
| `svgctx.js` | Canvas-2D-compatible recorder that writes SVG, so overlay drawing and d3 `geoPath` are shared by screen and SVG output |

Outside `src/js/`: `src/groups.js` (country groups and name matching) and `src/overseas.js` (the overseas parts split from France and the Netherlands), both CommonJS so the build scripts and tests can require them.

Conventions: modules share state only through `app`; UI panels re-render on events rather than being called directly; anything pure goes in a module without DOM access so it can be unit tested.

## Rendering design
- Ocean and shading: fullscreen triangle (`uMode` 0 ocean and background, 1 limb shading and rim).
- Country fills: triangle mesh (earcut, 4-degree grid clipping, antimeridian unwrap, Antarctica closed through the pole) with a per-vertex country id and a 256-entry palette texture. Hover and painting change palette entries.
- Lines (borders, graticule, lakes, rivers, hover outline): instanced quads with back-hemisphere clipping in the vertex shader.
- Regions and annotations: the 2D overlay canvas with d3's spherical clipping, so edges follow great circles.
- Picking: exact point-in-polygon on unwrapped polygons, not a raster.
- Enclaves merged by alias: Baikonur to Kazakhstan, USNB Guantanamo Bay to Cuba.
- Overseas parts split out (`src/overseas.js`): French Guiana, Guadeloupe, Martinique, Mayotte and Réunion from France, the Caribbean Netherlands (Bonaire, Saba, Sint Eustatius) from the Netherlands, as Natural Earth's map units do. Polygons are moved by lon/lat box into new geometries appended after the 255 world-atlas ones, so existing ids do not move. `build_tris.js` and `build.js` (which writes `countries.json`) both use the split topology. Continents place them geographically; the EU and Eurozone groups include the French regions (EU territory, euro), NATO does not (outside the treaty area). Maps saved with data `ne10m` (before the split) paint each part like its parent on load (`persist.js`); maps now save `d: 'ne10m-2'`.
- Country ids are 16-bit in `tris.bin` and the palette texture has 1024 entries (`PAL_N` in `gl.js`), so more units fit; there are 259 names now.
- Small-country markers: any country under about 40,000 km² (`TINY_MAX` in `data.js`) gets a dot while it is under 5 px across on screen (`TINY_PX` in `view.js`), clickable within 7 px. Drawn on the overlay below regions, filled with the country's paint, and written to SVG as `<circle data-name>` in a `small-countries` group. Uninhabited reefs and banks, the sovereign base areas and the Cyprus buffer zone are left out (`NO_MARKER`). The Vatican has zero area in the 10m data (quantisation collapses it), so its marker shows at every zoom. Layer toggle `layers.tiny`.

## Data
- Site layout: `dist/index.html` is the home page (`src/home/`), `dist/app/` the editor with `data/` and `admin1/` beside it. The editor reads `?new`, `?start=wikipedia|data|flat` and `?example=<name>` (loads `../examples/<name>.json`, whose `x` field sets export options and `mode` the panel mode); without them it continues the autosaved map. Starting fresh only overwrites the autosave once something changes. The home page loads no third-party resources (fonts self-hosted) and its globe uses world-atlas 110m.
- Countries: Natural Earth 10m via `world-atlas`, served as `app/data/countries.json`.
- `tris.bin` and `phys.bin`: deflate-raw, 1e-5 degree quantised, delta-coded (formats in `decode.js`). `phys.bin` stores the 29 major lakes (scalerank 0–1) first so they can be drawn alone.
- Subdivisions: Natural Earth 10m admin-1, one TopoJSON per country in `admin1/`, fetched on demand.
- Exact outlines (`t:'shape'`) are saved by reference (`{k:'c',names}` or `{k:'a1',c,ids}`), never by coordinates, and rebuilt with `topojson.merge`.

## Known limits
- Natural Earth 10m: Jutland's northern tip appears attached; admin-1 is coarse for some countries and its UK "region" grouping mixes NUTS regions.
- Admin-0 countries keep some overseas parts inside the parent. French Guiana, Guadeloupe, Martinique, Mayotte, Réunion and the Caribbean Netherlands are split out (see Data); Svalbard (Norway), the Canaries (Spain), and the Azores and Madeira (Portugal) still paint with their parent. Subdivisions for the split parts are still listed under France (`FRA.json`); the parts have no subdivision file of their own.
- Browser tests are slow on SwiftShader (software rendering), about 13 minutes for the suite. CI and headless Linux without a display use it; other machines use the real GPU (see `playwright.config.js`).
- Untested on real phones and touch screens.

## Roadmap and where things stand (13 Oct 2026)
Plans live in GitHub issues, grouped by the milestones Now / Next / Later. The Now milestone is finished: SVG export with provenance (#1), Wikipedia preset (#2), flat projections (#3), panel modes with phone support (#4), draggable legend (#5). From Next: home page done (#6), example gallery started (#7, four examples on the home page), small-country markers done (#8). Up next, in order: paintable subdivisions (#9), then the UK & Ireland and US packs, colour schemes, one-click statistics, spreadsheet import. Later: historical borders, disputed areas and worldviews, patterns, map furniture, time-lapse, embeds, cities, languages, quiz mode, custom maps, more country packs, offline, WebGL context loss, multi-part freehand regions.

Working agreements with Ari: never mention or compare to other map sites in the repo or the site; every reference data layer needs a named, openly licensed source; casual features must not weaken accuracy; examples and copy say plainly when something is fictional or when data is missing. Run the browser tests that touch a change locally and let CI run the full suite.

Exports swap the drawing projection with `view.withProjection()` for one synchronous draw, so overlay.js draws regions, labels and the legend through any d3 projection. The Wikipedia conventions page's colour table is missing its green values (template fault); #346733 and #c6debd come from the published orthographic maps.

## Naming and licensing
Working name Ecumene (org `ecumenemaps`). Still to check: trademarks (UK IPO, EUIPO, USPTO, classes 9 and 42) and registrar prices for `ecumene.app` / `ecumenemaps.com`.
Licence: AGPL-3.0-or-later. The repo is public and deploys to GitHub Pages (https://ecumenemaps.github.io/ecumene/) on every push to main; CI runs unit and browser tests on every push.
