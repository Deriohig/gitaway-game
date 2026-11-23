// stable.mjs -- the subset of the section-10 export the GAME session codes against (frozen at v3, 6e6e299).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURE = path.join(__dirname, 'fixtures', 'stable.v3.json');
export function stableSubset(exp) {
  const pieces = {};
  for (const id of exp.order) {
    const p = exp.pieces[id];
    pieces[id] = { keys: Object.keys(p).filter((k) => k !== 'water' && k !== 'waterFrame' && k !== 'openCoastAnchors').sort(), id: p.id, dockedPosition: p.dockedPosition, outline: p.outline,
      mainThetaRange: p.mainThetaRange || null, mainArc: p.mainArc || null, seams: p.seams || null, flatCore: p.flatCore || null,
      flatZones: id === 'main' ? p.flatZones : null, outlineFormula: p.outlineFormula || null };
  }
  return { format: exp.format, topKeys: Object.keys(exp).sort(), order: exp.order, joinedSize: exp.joinedSize, pieces };
}
// first difference between two JSON values (path + both values), or null
export function firstDiff(a, b, p = '') {
  if (a === b) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return `${p || '/'}: ${JSON.stringify(a)?.slice(0, 80)} != ${JSON.stringify(b)?.slice(0, 80)}`;
  if (Array.isArray(a) !== Array.isArray(b)) return `${p}: array/object mismatch`;
  const ks = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of ks) { const d = firstDiff(a[k], b[k], p + '/' + k); if (d) return d; }
  return null;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes('--write')) {
  const exp = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../config/blueprint.pieces.json'), 'utf8'));
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
  fs.writeFileSync(FIXTURE, JSON.stringify(stableSubset(exp)) + '\n');
  console.log('froze ' + FIXTURE);
}
