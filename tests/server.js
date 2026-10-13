// Minimal static server for tests: serves dist/ on PORT (default 8790).
const http = require('http'),
  fs = require('fs'),
  path = require('path');
const root = path.join(__dirname, '..', 'dist'),
  port = +process.env.PORT || 8790;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.bin': 'application/octet-stream',
  '.css': 'text/css',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
http
  .createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(root, path.normalize(p));
    if (!f.startsWith(root)) {
      res.writeHead(403);
      return res.end();
    }
    fs.readFile(f, (e, d) => {
      if (e) {
        res.writeHead(404);
        return res.end('not found');
      }
      res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
      res.end(d);
    });
  })
  .listen(port, () => console.log('serving dist on ' + port));
