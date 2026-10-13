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
| `view.js` | Orthographic camera: screen to lon/lat, zoom, animation |
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
| `svgctx.js` | Canvas-2D-compatible recorder that writes SVG, so overlay drawing and d3 `geoPath` are shared by screen and SVG output |

Conventions: modules share state only through `app`; UI panels re-render on events rather than being called directly; anything pure goes in a module without DOM access so it can be unit tested.

## Rendering design
- Ocean and shading: fullscreen triangle (`uMode` 0 ocean and background, 1 limb shading and rim).
- Country fills: triangle mesh (earcut, 4-degree grid clipping, antimeridian unwrap, Antarctica closed through the pole) with a per-vertex country id and a 256-entry palette texture. Hover and painting change palette entries.
- Lines (borders, graticule, lakes, rivers, hover outline): instanced quads with back-hemisphere clipping in the vertex shader.
- Regions and annotations: the 2D overlay canvas with d3's spherical clipping, so edges follow great circles.
- Picking: exact point-in-polygon on unwrapped polygons, not a raster.
- Enclaves merged by alias: Baikonur to Kazakhstan, USNB Guantanamo Bay to Cuba.

## Data
- Countries: Natural Earth 10m via `world-atlas`, served as `data/countries.json`.
- `tris.bin` and `phys.bin`: deflate-raw, 1e-5 degree quantised, delta-coded (formats in `decode.js`). `phys.bin` stores the 29 major lakes (scalerank 0–1) first so they can be drawn alone.
- Subdivisions: Natural Earth 10m admin-1, one TopoJSON per country in `admin1/`, fetched on demand.
- Exact outlines (`t:'shape'`) are saved by reference (`{k:'c',names}` or `{k:'a1',c,ids}`), never by coordinates, and rebuilt with `topojson.merge`.

## Known limits
- Natural Earth 10m: Jutland's northern tip appears attached; admin-1 is coarse for some countries and its UK "region" grouping mixes NUTS regions.
- Browser tests are slow on SwiftShader at high zoom.
- Untested on real phones and touch screens.

## Roadmap
Tracked as GitHub issues with Now / Next / Later milestones. Done: SVG export with provenance (#1), Wikipedia preset (#2), flat projections (#3). Still open from the original list: interface redesign around modes (Paint, Regions, Annotate, Data, Style, Export) with phone support; disputed-area styles and worldviews; tiny-country markers; context-loss handling; multi-part freehand regions; finer subdivisions; historical borders.

Exports swap the drawing projection with `view.withProjection()` for one synchronous draw, so overlay.js draws regions, labels and the legend through any d3 projection. The Wikipedia conventions page's colour table is missing its green values (template fault); #346733 and #c6debd come from the published orthographic maps.

## Naming and licensing
Working name Ecumene (org `ecumenemaps`). Still to check: trademarks (UK IPO, EUIPO, USPTO, classes 9 and 42) and registrar prices for `ecumene.app` / `ecumenemaps.com`.
Licence: AGPL-3.0-or-later (confirm before making the repo public). GitHub Pages on the free plan needs a public repo.
