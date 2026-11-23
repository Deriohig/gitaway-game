// node meshy/cap_orbit.mjs <page e.g. index.html> <outdir> <tgt x,y,z> <dist> <el> <az1,az2,...> [hour] [extra query]
// Orbit shots of one spot: ONE page load, then every azimuth through window.__saveShot (photo mode, everything unlocked, the
// animation clock frozen at rest, the time-of-day blend at `hour`) -> <outdir>/az<az>_el<el>_h<hour>.png (1200 x 900).
// (It used to reload the page per shot with ?cam=: ~1 min per shot in headless SwiftShader; this is the same camera in seconds.)
import { requirePlaywright } from '../lib/playwright.mjs';
import fs from 'node:fs';
const pw = requirePlaywright();
const [page0, outdir, tgt, dist, el, azs, hour = '16.5', extra = ''] = process.argv.slice(2);
fs.mkdirSync(outdir, { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errs = []; page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(`http://127.0.0.1:8187/${page0}?ui=0&shot=1${extra ? '&' + extra : ''}`); await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
await page.evaluate((h) => window.__look.setHour(h), +hour);
for (const az of azs.split(',').map(Number)) {
  const url = await page.evaluate(async ([az, el, dist, tgt]) => (await window.__saveShot('orbit', { mode: 'photo', az, el, dist, tgt, w: 1200, h: 900, unlocked: 'all', returnUrl: true })).url, [az, +el, +dist, tgt.split(',').map(Number)]);
  const f = `${outdir}/az${az}_el${el}_h${hour}.png`; fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64')); console.log('shot', f);
}
if (errs.length) console.log('console errors:\n' + errs.slice(0, 10).join('\n'));
await browser.close();
