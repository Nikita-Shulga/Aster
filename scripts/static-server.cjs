'use strict';
// Serves a folder over HTTP for previewing generated pages (e.g. the README render). Usage: node scripts/static-server.cjs <dir> <port>
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.argv[2] || '.');
const port = Number(process.argv[3]) || 4174;
const types = {'.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.css': 'text/css', '.js': 'text/javascript'};
http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(root)) return res.writeHead(403).end();
  fs.readFile(file, (err, data) => err ? res.writeHead(404).end() : res.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream'}).end(data));
}).listen(port, '127.0.0.1', () => console.log(`Serving ${root} on http://127.0.0.1:${port}`));
