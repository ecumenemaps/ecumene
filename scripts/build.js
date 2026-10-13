// Builds dist/: index.html (page + bundled script) and the data files it fetches.
// Usage: node scripts/build.js [--dev]   (--dev skips minification and adds a source map)
const fs = require('fs'), path = require('path'), esbuild = require('esbuild');
const R = (p) => path.join(__dirname, '..', p);
const dev = process.argv.includes('--dev');

const need = ['data/tris.bin', 'data/phys.bin', 'data/admin1/index.json'];
for (const f of need) if (!fs.existsSync(R(f))) { console.error('Missing ' + f + ' - run: npm run fetch && npm run data'); process.exit(1); }

fs.rmSync(R('dist'), { recursive: true, force: true });
fs.mkdirSync(R('dist/data'), { recursive: true });
fs.mkdirSync(R('dist/admin1'), { recursive: true });

// data files, fetched in parallel by the page
fs.writeFileSync(R('dist/data/countries.json'), JSON.stringify(require('world-atlas/countries-10m.json')));
fs.copyFileSync(R('data/tris.bin'), R('dist/data/tris.bin'));
fs.copyFileSync(R('data/phys.bin'), R('dist/data/phys.bin'));
for (const f of fs.readdirSync(R('data/admin1'))) fs.copyFileSync(R('data/admin1/' + f), R('dist/admin1/' + f));

// script bundle, inlined into the page
const out = esbuild.buildSync({
  entryPoints: [R('src/js/main.js')], bundle: true, format: 'iife', target: ['es2020'],
  minify: !dev, sourcemap: dev ? 'inline' : false, write: false, legalComments: 'none',
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = fs.readFileSync(R('src/template.html'), 'utf8') + '<script>' + js + '</script>\n</body>\n</html>\n';
fs.writeFileSync(R('dist/index.html'), html);

const kb = (n) => (n / 1024).toFixed(0) + ' KB';
const size = (p) => fs.statSync(R(p)).size;
const a1 = fs.readdirSync(R('dist/admin1')).reduce((s, f) => s + size('dist/admin1/' + f), 0);
console.log('dist/index.html ' + kb(html.length) + ' (script ' + kb(js.length) + ')');
console.log('dist/data: countries ' + kb(size('dist/data/countries.json')) + ', tris ' + kb(size('dist/data/tris.bin')) + ', phys ' + kb(size('dist/data/phys.bin')) + '; admin1 ' + kb(a1));
