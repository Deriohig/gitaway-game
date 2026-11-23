// node meshy/sheet.mjs <out.png> [<shots dir>] : farmhouse before/after sheet (HTML grid -> screenshot). The shots dir holds the
// captures the cells name (concept_gpt.png, orbit_old/, orbit_b/, views_now/, views_new3/): the argument, else MESHY_SHOTS_DIR, else
// art/scripts/.build/meshy (git-ignored)
import { requirePlaywright } from '../lib/playwright.mjs';
import { BUILD_DIR } from '../lib/paths.mjs';
import fs from 'node:fs';
import path from 'node:path';
const pw = requirePlaywright();
const M = path.resolve(process.argv[3] || process.env.MESHY_SHOTS_DIR || path.join(BUILD_DIR, 'meshy'));
const b64 = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const cell = (f, cap, crop) => `<figure><div class="im" style="background-image:url(${b64(f)});${crop || 'background-size:cover;background-position:center'}"></div><figcaption>${cap}</figcaption></figure>`;
// gameplay crop: default_mobile 720x1560, house near (312, 682)
const gp = 'background-size:300%;background-position:43% 44%';
const rows = [
  ['Concept (Meshy image)', 'Before: afternoon', 'After: afternoon'],
];
const html = `<!doctype html><meta charset=utf8><style>
body{margin:0;background:#1d1a22;color:#efe7da;font:15px/1.3 system-ui,sans-serif;width:1830px;padding:14px;box-sizing:border-box}
h1{font-size:20px;margin:2px 4px 10px} .g{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
figure{margin:0} .im{aspect-ratio:4/3;border-radius:6px;background-repeat:no-repeat;background-color:#000} figcaption{padding:5px 2px 2px;color:#cfc4b4}
</style><h1>Farmhouse: Meshy remake, finished in the proof (Golden afternoon, seed 11)</h1><div class=g>
${cell(M + '/concept_gpt.png', 'Concept (generated image the model was built from)', 'background-size:contain;background-position:center;background-color:#cfcfcf')}
${cell(M + '/orbit_old/az45_el22_h16.5.png', 'Before: afternoon (procedural box, 580 tris)')}
${cell(M + '/orbit_b/az45_el22_h16.5.png', 'After: afternoon (Meshy, 3,530 tris, one 1024² texture)')}
${cell(M + '/views_now/default_mobile.png', 'Before: gameplay camera (phone), zoomed', gp)}
${cell(M + '/orbit_old/az45_el22_h20.2.png', 'Before: dusk 20:12')}
${cell(M + '/orbit_b/az45_el22_h20.2.png', 'After: dusk 20:12 (painted panes glow, porch light under the awning)')}
${cell(M + '/views_new3/default_mobile.png', 'After: gameplay camera (phone), zoomed', gp)}
${cell(M + '/orbit_b/az135_el26_h16.5.png', 'After: right side (chimney + woodpile)')}
${cell(M + '/orbit_b/az225_el26_h16.5.png', 'After: back')}
</div><div class=g style="margin-top:10px">${cell(M + '/orbit_b/az315_el26_h16.5.png', 'After: left side (gable window, lean-to shed)')}</div>`;
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1830, height: 1000 } });
await page.setContent(html); await page.waitForTimeout(500);
await page.screenshot({ path: process.argv[2], fullPage: true });
await browser.close(); console.log('wrote', process.argv[2]);
