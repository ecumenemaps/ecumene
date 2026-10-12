# Handoff notes

Context for a new session picking this up.

## Rendering design
- Ocean and shading: fullscreen-triangle shader (`uMode` 0 ocean/bg, 1 lakes, 2 rivers, 3 graticule, 4 shading overlay).
- Country fills: triangle mesh (earcut, 4-degree grid clipping, antimeridian unwrap, Antarctica closed through the pole) with a per-vertex country id and a 256-entry palette texture. Hover and painting change palette entries.
- Borders and hover outlines: instanced line program.
- Picking: exact point-in-polygon on unwrapped polygons (`idAtLL`), not a raster grid.
- Packed data: deflate-raw + base64 blobs, 1e5-quantised delta-coded coordinates, decoded with `DecompressionStream`.
- Enclaves merged by alias: Baikonur to Kazakhstan, USNB Guantanamo Bay to Cuba.
- State: style object `S` with presets; undo/redo (200 snapshots); map codes `GM1.` + deflate-base64url; autosave to localStorage key `globeMap1`.

## Known limits
- Natural Earth 10m: Jutland's northern tip appears attached (data limit).
- The built page is about 12.8 MB, which is the artifact limit (16 MB). Subdivisions and history need hosted, lazily loaded data.
- The newest build (vector lakes/rivers/graticule, save/share) has had no user test report yet.

## Roadmap
Paste-a-list country input with presets (EU, NATO, continents); colour by data; legend editor; tiny-country markers; WebGL context-loss handler; Wikipedia-grade SVG/PNG export with provenance text and dashed disputed areas; worldview variants; admin-1 subdivisions; flat projections; freeform regions, arrows and labels (Yamnaya-style maps); historical borders; mobile test; hosting and a site shell.

## Naming and licensing
Working name Ecumene (org `ecumenemaps`). Still to check: trademarks (UK IPO, EUIPO, USPTO, classes 9 and 42), registrar prices for `ecumene.app` / `ecumenemaps.com`.
Licence choice: AGPL-3.0-or-later (recommended; confirm before making the repo public).
