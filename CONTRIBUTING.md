# Contributing

1. `npm install`, `npm run fetch`, `npm run data` once; then `npm run dev` while working.
2. Keep pure logic (geometry, parsing, decoding) in modules without DOM access and add unit tests for it in `tests/unit/`.
3. Every user-visible feature gets a browser test in `tests/e2e/`. Run `npm test` before pushing.
4. Format with `npm run format`.
5. New data sources need a licence compatible with AGPL-3.0, an entry in the README table, and attribution where required. Never commit generated data (`data/*.bin`, `data/admin1/`) or `dist/`.
