// tooling.test.mjs -- tooling hygiene: no Claude session scratchpad in art/scripts, the proof folder is an env var with a repo-local
// git-ignored default, shots.mjs serves it, and Playwright is resolved PLAYWRIGHT_ROOT first. Pure node (spawns node and shots.mjs).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), SCRIPTS = path.resolve(HERE, '..'), REPO = path.resolve(SCRIPTS, '../..');
let pass = 0, fail = 0;
const ok = (name, errs) => { const good = !errs.length; good ? pass++ : fail++; console.log(`  ${good ? 'PASS' : 'FAIL'}  ${name}${good ? '' : '\n        ' + errs.join('; ')}`); };
const rel = (f) => path.relative(SCRIPTS, f);
const nodeJson = (code, env, unset) => {   // run `code` in a fresh node under env (unset vars removed), parse its last stdout line
  const base = { ...process.env }; for (const k of unset) delete base[k];
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...base, ...env }, encoding: 'utf8' });
  try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch { return { err: (r.stderr || r.stdout).trim().split('\n').slice(-2).join(' ') }; } };

// every source file of the pipeline (this test excluded: it spells the patterns it looks for)
const sources = (dir = SCRIPTS, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.build') continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) sources(f, out); else if (/\.(mjs|js)$/.test(e.name) && f !== fileURLToPath(import.meta.url)) out.push(f);
  }
  return out; };
const SRC = sources().map((f) => ({ f, text: fs.readFileSync(f, 'utf8') }));

// TL1: no source names a session scratchpad
{ const scratch = new RegExp(['AppData', 'Local', 'Temp', 'claude'].join('[\\\\/]+') + '|/tmp/claude\\b');
  ok('TL1 no art/scripts source names a session scratchpad', SRC.filter((s) => scratch.test(s.text)).map((s) => 'hard-coded in ' + rel(s.f))); }

// TL2: PROOF_DIR defaults to a git-ignored repo-local folder; PROOF_DIR > GITAWAY_PROOF > default
{ const PATHS = path.join(SCRIPTS, 'lib', 'paths.mjs'), want = path.join(SCRIPTS, '.build', 'proof'), e = [];
  const pathsWith = (env) => nodeJson(`const m = await import(${JSON.stringify('file://' + PATHS)}); console.log(JSON.stringify({ proof: m.PROOF_DIR, def: m.DEFAULT_PROOF_DIR ?? null, shots: m.SHOTS_DIR }));`, env, ['PROOF_DIR', 'GITAWAY_PROOF']);
  const d = pathsWith({}), a = pathsWith({ PROOF_DIR: '/tmp/tl2-a' }), b = pathsWith({ GITAWAY_PROOF: '/tmp/tl2-b' }), ab = pathsWith({ PROOF_DIR: '/tmp/tl2-a', GITAWAY_PROOF: '/tmp/tl2-b' });
  if (d.proof !== want) e.push(`default ${d.proof ?? d.err}`);
  if (d.def !== want) e.push(`DEFAULT_PROOF_DIR ${d.def}`);
  if (d.shots !== path.join(want, '_shots')) e.push(`SHOTS_DIR ${d.shots}`);
  if (a.proof !== '/tmp/tl2-a') e.push(`PROOF_DIR env -> ${a.proof ?? a.err}`);
  if (b.proof !== '/tmp/tl2-b') e.push(`GITAWAY_PROOF env -> ${b.proof ?? b.err}`);
  if (ab.proof !== '/tmp/tl2-a') e.push(`both set -> ${ab.proof ?? ab.err} (PROOF_DIR should win)`);
  if (spawnSync('git', ['check-ignore', '-q', path.join(want, 'index.html')], { cwd: REPO }).status !== 0) e.push('proof folder is not git-ignored');
  ok('TL2 PROOF_DIR: default art/scripts/.build/proof (git-ignored); PROOF_DIR > GITAWAY_PROOF > default', e); }

// TL3: build.mjs and shots.mjs take the proof folder from lib/paths.mjs
{ const imp = /import\s*\{[^}]*\bPROOF_DIR\b[^}]*\}\s*from\s*'\.\/lib\/paths\.mjs'/, e = [];
  for (const f of ['build.mjs', 'shots.mjs']) { const t = fs.readFileSync(path.join(SCRIPTS, f), 'utf8');
    if (!imp.test(t)) e.push(`${f} does not import PROOF_DIR from ./lib/paths.mjs`);
    if (/process\.env\.(PROOF_DIR|GITAWAY_PROOF)/.test(t)) e.push(`${f} reads the proof env var itself`);
    if (/\bconst\s+(SCRATCH|PROOF|PROOF_DIR)\s*=/.test(t)) e.push(`${f} defines its own proof folder`); }
  ok('TL3 build.mjs and shots.mjs take the proof folder from lib/paths.mjs', e); }

// TL4: shots.mjs serves PROOF_DIR (GET /) and writes POSTed shots under PROOF_DIR/_shots
{ const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tl4-proof-')), e = [];
  const port = await new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
  const marker = `<!doctype html><title>tl4 ${process.pid}</title>`; fs.writeFileSync(path.join(tmp, 'index.html'), marker);
  const env = { ...process.env, PROOF_DIR: tmp, PORT: String(port) }; delete env.GITAWAY_PROOF;
  const child = spawn(process.execPath, [path.join(SCRIPTS, 'shots.mjs')], { cwd: SCRIPTS, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; for (const s of [child.stdout, child.stderr]) s.on('data', (c) => { log += c; });
  const url = `http://127.0.0.1:${port}`; let body = null;
  for (let i = 0; i < 50 && body === null; i++) { try { const r = await fetch(url + '/'); body = r.ok ? await r.text() : `HTTP ${r.status}`; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  if (body !== marker) e.push(`GET / -> ${body === null ? 'no server (' + log.trim().split('\n').pop() + ')' : JSON.stringify(body.slice(0, 60))}`);
  else {
    try { await fetch(url + '/shot/tl4_probe', { method: 'POST', body: 'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64') }); } catch (err) { e.push('POST failed: ' + err.message); }
    if (!fs.existsSync(path.join(tmp, '_shots', 'tl4_probe.png'))) e.push('POST /shot/tl4_probe did not land in <PROOF_DIR>/_shots');
  }
  child.kill(); fs.rmSync(tmp, { recursive: true, force: true });
  ok('TL4 shots.mjs serves PROOF_DIR and writes shots to PROOF_DIR/_shots', e); }

// TL5: Playwright: one lookup (lib/playwright.mjs), PLAYWRIGHT_ROOT > repo root > main checkout, deduplicated
{ const e = [], PW = path.join(SCRIPTS, 'lib', 'playwright.mjs');
  const direct = SRC.filter((s) => s.f !== PW && /require\.resolve\(\s*'playwright'/.test(s.text)).map((s) => rel(s.f));
  const pinned = SRC.filter((s) => /\/home\/me\/Projects\/gitaway['"`/]/.test(s.text.replace(/^\s*\/\/.*$/gm, ''))).map((s) => rel(s.f));
  if (direct.length) e.push(`own lookup in: ${direct}`);
  if (pinned.length) e.push(`checkout path in code: ${pinned}`);
  const roots = (env) => { const r = nodeJson(`const m = await import(${JSON.stringify('file://' + PW)}); console.log(JSON.stringify(m.playwrightRoots()));`, env, ['PLAYWRIGHT_ROOT']); return r.err ? null : r; };
  const common = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: REPO, encoding: 'utf8' }).stdout.trim(), main = common ? path.dirname(common) : null;
  const withEnv = roots({ PLAYWRIGHT_ROOT: '/tmp/tl5-pw' }), without = roots({});
  if (!withEnv) e.push('lib/playwright.mjs playwrightRoots() missing');
  else {
    if (withEnv[0] !== '/tmp/tl5-pw') e.push(`PLAYWRIGHT_ROOT not first: ${withEnv}`);
    if (withEnv[1] !== REPO) e.push(`repo root not second: ${withEnv}`);
    if (main && !withEnv.includes(main)) e.push(`main checkout ${main} missing`);
    if (new Set(withEnv).size !== withEnv.length) e.push('duplicate roots');
    if (!without || without[0] !== REPO) e.push(`without PLAYWRIGHT_ROOT the repo root should lead: ${without}`);
  }
  ok('TL5 Playwright: one lookup (lib/playwright.mjs), PLAYWRIGHT_ROOT > repo root > main checkout', e); }

console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
