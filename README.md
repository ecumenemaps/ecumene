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
- `scripts/`: data builds (`build_tris.js`, `build_phys.js`, `build_admin1.js`, `build_layers.js`, helpers `lib/tri.js` and `lib/cut.js`, which the editor also uses), downloads (`fetch_data.js` for Natural Earth, `fetch_sources.js` for the layers listed in `scripts/sources/`), and `build.js`. See "Adding a data layer" in `HANDOFF.md`.
- `src/home/`: the home page (template and the hero globe script); `site/examples/`: example maps (state JSON and thumbnails, made by `scripts/make_examples.js`)
- `tests/unit/`, `tests/e2e/`: tests; `tests/server.js` is a minimal static server

## Data and licences
<!-- sources:start (generated from scripts/sources by `node scripts/fetch_sources.js --readme`) -->
| Data | Source | Licence |
|---|---|---|
| Countries (10m) | Natural Earth via `world-atlas` | Public domain |
| Lakes, rivers (10m) | Natural Earth | Public domain |
| States and provinces (admin-1, 10m) | Natural Earth | Public domain |
| Westminster parliamentary constituencies (UK, July 2024) | [Office for National Statistics, Open Geography Portal](https://geoportal.statistics.gov.uk/datasets/ef63f363ac824b79ae9670744fcc4307), Boundaries as at 4 July 2024 | [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/) |
| Counties and unitary authorities (UK, December 2025) | [Office for National Statistics, Open Geography Portal](https://geoportal.statistics.gov.uk/datasets/e546277846294ad38138cbe651e7a3e0), Boundaries as at December 2025 | [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/) |
| Ceremonial counties (UK: England's ceremonial counties, Wales's preserved counties, Scotland's lieutenancy areas, Northern Ireland's counties) | [Ordnance Survey, Boundary-Line; Ordnance Survey of Northern Ireland (Land & Property Services)](https://www.ordnancesurvey.co.uk/products/boundary-line), OS Boundary-Line October 2026 (Great Britain) | [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/) |
| Historic counties (UK: England and Wales as in 1888, Scotland as in 1889, Northern Ireland's six counties) | [Ordnance Survey, Boundary-Line; Ordnance Survey of Northern Ireland (Land & Property Services)](https://www.ordnancesurvey.co.uk/products/boundary-line), Counties as in 1888 (England and Wales) and 1889 (Scotland), from OS Boundary-Line October 2026 | [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/) |
| Counties (Ireland, 2019 statutory boundaries) | [Tailte Éireann](https://data-osi.opendata.arcgis.com/datasets/7ef9c5102d61424295e98505a00251ea), 2019 statutory boundaries | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Local authority areas (Ireland: administrative counties and cities, 2019 statutory boundaries) | [Tailte Éireann](https://data-osi.opendata.arcgis.com/datasets/7f508baddb9644d8ac3c3921df39303a), 2019 statutory boundaries | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Dáil constituencies (Ireland, Electoral (Amendment) Act 2023) | [Tailte Éireann](https://data-osi.opendata.arcgis.com/datasets/a37ad6a3a6ff47e4a5a0ff313b418448), 43 constituencies of the Electoral (Amendment) Act 2023 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Counties and county equivalents (United States, 2024) | [U.S. Census Bureau, cartographic boundary files](https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html), 2024 cartographic boundaries, 1:5,000,000 | [Public domain (U.S. government work)](https://www.usa.gov/government-copyright) |
| Congressional districts (United States, 119th Congress, 2025-2027) | [U.S. Census Bureau, cartographic boundary files](https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html), Districts of the 119th Congress (elected in 2024), 2024 cartographic boundaries, 1:5,000,000 | [Public domain (U.S. government work)](https://www.usa.gov/government-copyright) |
| Municipios (Puerto Rico, 2024) | [U.S. Census Bureau, cartographic boundary files](https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html), 2024 cartographic boundaries, 1:5,000,000 | [Public domain (U.S. government work)](https://www.usa.gov/government-copyright) |
| Country statistics (Data panel): GDP per capita, population, life expectancy and 9 more indicators | [World Bank, World Development Indicators](https://datatopics.worldbank.org/world-development-indicators/) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Electoral votes per US state (Data panel), 2024 and 2028 elections | [U.S. Census Bureau, 2020 Census apportionment of the U.S. House of Representatives](https://www.census.gov/data/tables/2020/dec/2020-apportionment-data.html) | [Public domain (U.S. government work)](https://www.usa.gov/government-copyright) |
| Country groups: European Union and Eurozone | [European Union, EU countries](https://european-union.europa.eu/principles-countries-history/eu-countries_en); [European Central Bank, euro area countries](https://www.ecb.europa.eu/euro/intro/html/index.en.html), checked 14 Oct 2026 | Membership is a fact; no licence claimed (terms of the pages checked: EU site content is CC BY 4.0 (europa.eu legal notice); the ECB page's terms were not checked) |
| Country groups: NATO | [NATO, member countries](https://www.nato.int/en/about-us/organization/nato-member-countries), checked 14 Oct 2026 | Membership is a fact; no licence claimed (terms of the pages checked: not found, NATO's copyright pages did not load) |
| Country groups: UN Security Council permanent members | [United Nations, UN Charter Chapter V, Article 23](https://www.un.org/en/about-us/un-charter/chapter-5), checked 14 Oct 2026 | The five names are a fact; no licence claimed (terms of the pages checked: UN terms of use allow personal use only and no redistribution, so nothing is copied from the page) |
| Country groups: G7 and G20 | [Government of Canada, Canada and the G7](https://www.international.gc.ca/world-monde/international_relations-relations_internationales/g7/index.aspx?lang=eng); [Canada and the G20](https://www.international.gc.ca/world-monde/international_relations-relations_internationales/g20/index.aspx?lang=eng), checked 14 Oct 2026; g20.org (2026 presidency) compared, see the group note | Membership is a fact; no licence claimed (terms of the pages checked: Canada.ca restricts commercial reproduction and requires permission, so nothing is copied from the pages) |
| Country groups: ASEAN | [Government of Japan, Ministry of Foreign Affairs, ASEAN](https://www.mofa.go.jp/region/asia-paci/asean/index.html), checked 14 Oct 2026 (asean.org cannot be read by a script) | Membership is a fact; no licence claimed (terms of the pages checked: not checked, the page is marked Copyright MOFA) |
| Country groups: second opinion for EU, NATO, G7 and G20 | [Wikidata](https://www.wikidata.org/), membership statements, compared by scripts/check_groups.js | CC0 |
| Country groups: continents | [UN Statistics Division, M49 classification](https://unstats.un.org/unsd/methodology/m49/overview/), checked 14 Oct 2026; the Americas split into North and South by its sub-regions, and places it does not list keep the continent of the land around them | The classification is a fact; no licence claimed (terms of the pages checked: UN terms of use allow personal use only and no redistribution, so nothing is copied from the page) |
| Robinson and Winkel tripel projections | `d3-geo-projection` | ISC |
| Home-page typeface: Source Serif 4 | Adobe, via `@fontsource-variable/source-serif-4` (self-hosted) | SIL OFL 1.1 |
| GDP per capita example | World Bank, World Development Indicators (NY.GDP.PCAP.CD, 2022), fetched from the World Bank's API and saved in the example with the date | CC BY 4.0 |
<!-- sources:end -->

Layers other than Natural Earth are fitted to the Natural Earth coastline, so paint stays on the map's land; each export credits every layer it uses, in the source note and in the SVG's description.

Natural Earth depicts de facto boundaries and is not authoritative for disputed areas. Any future data (geoBoundaries CC BY 4.0, GADM and Eurostat non-commercial, CShapes CC BY-NC-SA, historical-basemaps GPL-3.0, OpenHistoricalMap CC0) must be checked against this project's licence before use.

## Licence
AGPL-3.0-or-later. See `LICENSE`.
