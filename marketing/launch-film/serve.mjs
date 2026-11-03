// Tiny static server so canvas can read local images (file:// taints the canvas).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.svg': 'image/svg+xml',   // without this an SVG logo used as an <img> never loads, silently
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
export function serve(root = '.') {
  return new Promise(res => {
    const base = path.resolve(root);
    const srv = http.createServer((req, r) => {
      // only files inside the film folder: a path that climbs out of it with ../ is refused
      let p = ''; try { p = path.join(base, decodeURIComponent(req.url.split('?')[0])); } catch {}
      if (p !== base && !p.startsWith(base + path.sep)) { r.writeHead(403); r.end(); return; }
      fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); r.end(d); });
    // 127.0.0.1: this computer only. Without a host the server answers the whole network.
    }).listen(0, '127.0.0.1', () => res({ srv, url: `http://127.0.0.1:${srv.address().port}` }));
  });
}
