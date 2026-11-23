// shots.mjs  --  the deterministic comparison-render HARNESS server.
// =============================================================================
// Re-runnable: `node shots.mjs` starts a tiny HTTP server (Node built-ins only,
// NO deps) that (1) statically serves the proof/ viewer (index.html + .wasm) and
// (2) accepts POST /shot/<name> (body = a data:image/png;base64 URL from the
// viewer's window.__saveShot) and writes proof/_shots/<name>.png.
// The proof folder is lib/paths.mjs PROOF_DIR, the one build.mjs writes: env
// PROOF_DIR (or GITAWAY_PROOF), default art/scripts/.build/proof (git-ignored).
//
// Capture all 6 fixed presets (world.config cameras) at both locked seeds by
// loading, in a browser pointed at this server:
//   /index.html?capture=after&seed=<defaultSeed>     -> after_<preset>.png
//   /index.html?capture=after&seed=<altSeed>         -> after_<preset>_seed<alt>.png
// (use ?capture=baseline for the before-set). The viewer's capture driver walks
// the presets via __saveShot and POSTs each PNG here. GET /__shots lists what has
// landed so far (for polling). Bind 127.0.0.1 so Windows localhost can reach it.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { PROOF_DIR as PROOF, SHOTS_DIR as SHOTS } from './lib/paths.mjs';

const PORT = parseInt(process.env.PORT || '8187', 10);
fs.mkdirSync(SHOTS, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/octet-stream', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  // --- POST /shot/<name> : write a PNG from a data URL body ---
  if (req.method === 'POST' && u.pathname.startsWith('/shot/')) {
    const name = decodeURIComponent(u.pathname.slice('/shot/'.length)).replace(/[^a-zA-Z0-9_.-]/g, '_');
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const b64 = body.replace(/^data:image\/png;base64,/, '');
        fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(b64, 'base64'));
        console.log('shot', name, '(' + Math.round(b64.length / 1024) + ' KB b64)');
        res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok ' + name);
      } catch (e) { console.error('shot error', e); res.writeHead(500); res.end('err'); }
    });
    return;
  }
  // --- GET /__shots : list captured PNGs (polling) ---
  if (u.pathname === '/__shots') {
    const files = fs.readdirSync(SHOTS).filter((f) => f.endsWith('.png')).sort();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ count: files.length, files })); return;
  }
  // --- static serve from proof/ ---
  let p = decodeURIComponent(u.pathname);
  if (p === '/' || p === '') p = '/index.html';
  const fp = path.join(PROOF, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('gitaway shot server on http://127.0.0.1:' + PORT + '/  (proof: ' + PROOF + ')');
  console.log('capture: open /index.html?capture=after&seed=<N>  (shots -> ' + SHOTS + ')');
});
