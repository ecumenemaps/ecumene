# Ecumene

Accurate, open-source map maker on a draggable 3D globe (WebGL2 + d3-geo), with a home page and an editor.
Read HANDOFF.md first: module map, rendering design, data formats, known limits, roadmap and working agreements.
Plans and priorities are GitHub issues in ecumenemaps/ecumene (milestones Now / Next / Later).

## Commands
- First-time setup: `npm ci`, `npm run fetch` (Natural Earth sources), `npm run data` (builds data/*.bin and data/admin1), `npx playwright install chromium`
- Build: `npm run build` (writes dist/: home page, app/ editor, data, fonts, examples)
- Serve: `npm run serve` then open http://127.0.0.1:8790/ (home) or /app/ (editor)
- Tests: `npm run test:unit`; `npx playwright test -g "<name>"` for the browser tests a change touches; CI runs the full suite on push
- Example maps for the home page: `node scripts/make_examples.js [name]` with the server running

## Rules
- Never mention or compare with other map websites, in code, docs, commits or the site.
- Every reference data layer needs a named, openly licensed source recorded in the README table and in export provenance.
- Say plainly when something is fictional, approximate or missing data.
- The owner is Ari; explain choices in plain language and ask before anything hard to undo.
