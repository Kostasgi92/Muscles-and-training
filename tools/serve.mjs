// Τοπικός server για δοκιμές: σερβίρει το dist/ και τυλίγει το index.html
// με τον ίδιο σκελετό που προσθέτει το claude.ai artifact κατά τη δημοσίευση.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2] ?? 'dist');
const port = Number(process.argv[3] ?? 8080);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.bin': 'application/octet-stream', '.json': 'application/json' };
const skeleton = (body) => `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif;background:#faf9f7}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${body}</body></html>`;

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const file = path.join(dir, p);
  if (!file.startsWith(dir) || !fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
  let data = fs.readFileSync(file);
  const ext = path.extname(file);
  if (ext === '.html') data = Buffer.from(skeleton(data.toString('utf8')));
  res.writeHead(200, { 'content-type': types[ext] ?? 'application/octet-stream', 'content-length': data.length, 'cache-control': 'no-store' });
  res.end(data);
}).listen(port, () => console.log(`http://localhost:${port}`));
