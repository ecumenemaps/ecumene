// Builds dist/: the home page (index.html), the editor (app/index.html with the data it fetches),
// the self-hosted home-page fonts and the example maps.
// Usage: node scripts/build.js [--dev]   (--dev skips minification and adds a source map)
const fs = require('fs'), path = require('path'), esbuild = require('esbuild');
const R = (p) => path.join(__dirname, '..', p);
const dev = process.argv.includes('--dev');

const need = ['data/tris.bin', 'data/phys.bin', 'data/admin1/index.json'];
for (const f of need) if (!fs.existsSync(R(f))) { console.error('Missing ' + f + ' - run: npm run fetch && npm run data'); process.exit(1); }

fs.rmSync(R('dist'), { recursive: true, force: true });
for (const d of ['dist/app/data', 'dist/app/admin1', 'dist/fonts', 'dist/home', 'dist/examples']) fs.mkdirSync(R(d), { recursive: true });

// editor data files, fetched in parallel by the editor
// with overseas parts (French Guiana, Réunion, Caribbean Netherlands...) as their own units, as in tris.bin
fs.writeFileSync(R('dist/app/data/countries.json'), JSON.stringify(require('../src/overseas.js').splitOverseas(require('world-atlas/countries-10m.json'), require('topojson-client').feature)));
fs.copyFileSync(R('data/tris.bin'), R('dist/app/data/tris.bin'));
fs.copyFileSync(R('data/phys.bin'), R('dist/app/data/phys.bin'));
// base64 copies for hosts that refuse .bin (see fetchBin in src/js/data.js)
for (const k of ['tris', 'phys']) fs.writeFileSync(R('dist/app/data/' + k + '.b64.txt'), fs.readFileSync(R('data/' + k + '.bin')).toString('base64'));
for (const f of fs.readdirSync(R('data/admin1'))) fs.copyFileSync(R('data/admin1/' + f), R('dist/app/admin1/' + f));
// other subdivision layers (scripts/build_layers.js); optional, the editor works without them
if (fs.existsSync(R('data/layers'))) fs.cpSync(R('data/layers'), R('dist/app/layers'), { recursive: true });

// a script bundle inlined into an HTML template
function page(entry, template, outFile, transform = (h) => h) {
  const out = esbuild.buildSync({
    entryPoints: [R(entry)], bundle: true, format: 'iife', target: ['es2020'],
    minify: !dev, sourcemap: dev ? 'inline' : false, write: false, legalComments: 'none',
  });
  const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const html = transform(fs.readFileSync(R(template), 'utf8')) + '<script>' + js + '</script>\n</body>\n</html>\n';
  fs.writeFileSync(R(outFile), html);
  return { html: html.length, js: js.length };
}
const app = page('src/js/main.js', 'src/template.html', 'dist/app/index.html');
// the clipper for cutting lakes out of exported shapes (src/js/export.js), loaded on the first export
esbuild.buildSync({
  stdin: { contents: "import pc from 'polygon-clipping'; window.polygonClipping = pc;", resolveDir: R('.') },
  bundle: true, format: 'iife', target: ['es2020'], minify: !dev, legalComments: 'none', outfile: R('dist/app/clip.js'),
});
// the example gallery (scripts/lib/gallery.js): featured cards on the home page, every example on dist/gallery/
const G = require('./lib/gallery.js'),
  examples = G.loadExamples(R('site/examples'));
const home = page('src/home/home.js', 'src/home/index.html', 'dist/index.html', (h) => G.homeWithExamples(h, examples));
fs.mkdirSync(R('dist/gallery'), { recursive: true });
fs.writeFileSync(R('dist/gallery/index.html'), G.galleryPage(fs.readFileSync(R('src/gallery/index.html'), 'utf8'), fs.readFileSync(R('src/home/index.html'), 'utf8'), examples));

// home page: small world for the hero globe, self-hosted fonts (no third-party requests), examples
const w110 = require('world-atlas/countries-110m.json');
fs.writeFileSync(R('dist/home/countries-110m.json'), JSON.stringify({ ...w110, objects: { countries: w110.objects.countries } }));
const FONT = 'node_modules/@fontsource-variable/source-serif-4/files/';
for (const f of ['source-serif-4-latin-opsz-normal.woff2', 'source-serif-4-latin-opsz-italic.woff2']) fs.copyFileSync(R(FONT + f), R('dist/fonts/' + f));
for (const f of fs.readdirSync(R('site/examples'))) fs.copyFileSync(R('site/examples/' + f), R('dist/examples/' + f));

const kb = (n) => (n / 1024).toFixed(0) + ' KB';
const size = (p) => fs.statSync(R(p)).size;
const a1 = fs.readdirSync(R('dist/app/admin1')).reduce((s, f) => s + size('dist/app/admin1/' + f), 0);
console.log('dist/index.html (home) ' + kb(home.html) + ' (script ' + kb(home.js) + ')');
console.log('dist/app/index.html ' + kb(app.html) + ' (script ' + kb(app.js) + '), clip.js ' + kb(size('dist/app/clip.js')));
console.log('dist/app/data: countries ' + kb(size('dist/app/data/countries.json')) + ', tris ' + kb(size('dist/app/data/tris.bin')) + ', phys ' + kb(size('dist/app/data/phys.bin')) + '; admin1 ' + kb(a1));
