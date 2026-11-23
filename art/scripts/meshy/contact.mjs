// node meshy/contact.mjs <out.png> <title> <img:label> ... : labelled grid (4 columns) -> screenshot
import { requirePlaywright } from '../lib/playwright.mjs';
import fs from 'node:fs';
const pw = requirePlaywright();
const [out, title, ...items] = process.argv.slice(2);
const cells = items.map((it) => { const i = it.lastIndexOf(':'), f = it.slice(0, i), cap = it.slice(i + 1), ext = f.endsWith('.jpg') ? 'jpeg' : 'png';
  return `<figure><img src="data:image/${ext};base64,${fs.readFileSync(f).toString('base64')}"><figcaption>${cap}</figcaption></figure>`; }).join('');
const html = `<!doctype html><meta charset=utf8><style>body{margin:0;background:#1d1a22;color:#efe7da;font:15px system-ui,sans-serif;width:1600px;padding:12px;box-sizing:border-box}
h1{font-size:19px;margin:2px 4px 10px}.g{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}figure{margin:0}img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;display:block}
figcaption{padding:4px 2px;color:#cfc4b4}</style><h1>${title}</h1><div class=g>${cells}</div>`;
const b = await pw.chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.setContent(html); await p.waitForTimeout(300); await p.screenshot({ path: out, fullPage: true }); await b.close(); console.log('wrote', out);
