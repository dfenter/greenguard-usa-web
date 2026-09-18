// Shared static server for QA probes. Serves the worktree root at /play/razorfin/...
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
export function startServer(root, port) {
  const server = http.createServer((q, s) => {
    let f = decodeURIComponent(q.url.split('?')[0]);
    if (f.endsWith('/')) f += 'index.html';
    fs.readFile(path.join(root, f), (e, d) => {
      if (e) { s.writeHead(404); s.end(); return; }
      const headers = { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' };
      if (f.startsWith('/play/')) headers['Service-Worker-Allowed'] = '/play/';
      s.writeHead(200, headers);
      s.end(d);
    });
  });
  return new Promise(r => server.listen(port, () => r(server)));
}
