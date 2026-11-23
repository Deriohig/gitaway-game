// finish.mjs --crown (conifer structure) on the RAW hero tree (art/meshy/hero_tree/source/raw.glb, git-ignored Meshy download).
// The test FAILS, never skips, when it is missing. The game sways crowns by node name: a conifer must have `Crown` > `Canopy`.
//   F1 --canopy --crown: one mesh-less `Crown` under the trunk, with exactly one child `Canopy` at its local origin; Crown's world
//      translation = the plain run's Canopy pivot and no vertex moves in world space
//   F2 --canopy alone: no `Crown`, byte-identical to the pre-`--crown` output (sha256 pinned; re-pin only from a run of the old commit)
//   F3 --crown without --canopy exits non-zero with "--crown needs --canopy" and writes nothing
import { NodeIO } from '@gltf-transform/core';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)), finish = path.join(here, '..', 'meshy', 'finish.mjs');
const RAW = path.join(here, '..', '..', 'meshy', 'hero_tree', 'source', 'raw.glb');
const BASE = ['--id', 'hero_tree', '--height', '3.4', '--tex', '256'];
const ARGS = [...BASE, '--q', '85', '--compact', '--canopy', '--leafMinY', '0.2'];
const PLAIN_SHA = '1a958490b894a636816f1e041b49b9cb5b454ee9f321131d3bb19da34d031294';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { cond ? pass++ : fail++; console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n        ' + detail : ''}`); };
const done = () => { console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0); };

if (!fs.existsSync(RAW)) { ok('fixture: the raw hero tree is present', false, `missing ${RAW} (git-ignored; hero_tree.glb is NOT a valid substitute)`); done(); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'finish-crown-'));
const node = (args) => spawnSync('node', [finish, RAW, ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
const PLAIN = path.join(tmp, 'plain.glb'), CROWN = path.join(tmp, 'crown.glb'), NOCANOPY = path.join(tmp, 'nocanopy.glb');
const plainRun = node([PLAIN, ...ARGS]), crownRun = node([CROWN, ...ARGS, '--crown']);
if (plainRun.status !== 0 || crownRun.status !== 0) {
  ok('fixture: finish.mjs runs on the raw hero tree (plain and --crown)', false, (plainRun.stderr + crownRun.stderr).split('\n').slice(0, 8).join('\n        '));
  fs.rmSync(tmp, { recursive: true, force: true }); done();
}

const read = async (f) => (await new NodeIO().read(f)).getRoot();
const byName = (r, name) => r.listNodes().filter((n) => n.getName() === name);
const NAN3 = [NaN, NaN, NaN];
// every vertex of a node's mesh in world space
const worldPos = (n) => { const w = n.getWorldMatrix(), A = n.getMesh().listPrimitives()[0].getAttribute('POSITION'), e = [0, 0, 0], out = new Float64Array(A.getCount() * 3);
  for (let i = 0; i < A.getCount(); i++) { A.getElement(i, e); for (let k = 0; k < 3; k++) out[i * 3 + k] = w[k] * e[0] + w[4 + k] * e[1] + w[8 + k] * e[2] + w[12 + k]; }
  return out; };
const maxDiff = (p, q) => { if (p.length !== q.length) return Infinity; let m = 0; for (let i = 0; i < p.length; i++) m = Math.max(m, Math.abs(p[i] - q[i])); return m; };

const rp = await read(PLAIN), rc = await read(CROWN);
const pCanopy = byName(rp, 'Canopy')[0], pTrunk = byName(rp, 'hero_tree')[0];
ok('reference: a plain --canopy run has hero_tree > Canopy', !!pCanopy && !!pTrunk && pTrunk.listChildren().includes(pCanopy));
const pivot = pCanopy ? pCanopy.getWorldTranslation() : NAN3;

const crowns = byName(rc, 'Crown'), crown = crowns[0], trunk = byName(rc, 'hero_tree')[0], canopies = byName(rc, 'Canopy'), canopy = canopies[0];
const kids = crown ? crown.listChildren() : [];
ok('F1a a single mesh-less `Crown` under the trunk mesh node, with exactly one child: `Canopy`',
  crowns.length === 1 && !crown.getMesh() && !!trunk && !!trunk.getMesh() && crown.getParentNode() === trunk && kids.length === 1 && kids[0].getName() === 'Canopy' && canopies.length === 1 && canopy === kids[0]);
const cw = crown ? crown.getWorldTranslation() : NAN3;
ok('F1b Crown\'s world translation = the plain run\'s Canopy pivot (1e-4)', cw.every((v, k) => Math.abs(v - pivot[k]) <= 1e-4));
const lt = canopy ? canopy.getTranslation() : NAN3;
ok('F1c Canopy sits at its own local origin and still holds the foliage mesh', !!canopy && !!canopy.getMesh() && lt.every((v) => v === 0));
const meshes = !!(canopy && trunk && pCanopy && pTrunk && canopy.getMesh() && trunk.getMesh());
const dc = meshes ? maxDiff(worldPos(canopy), worldPos(pCanopy)) : Infinity, dt = meshes ? maxDiff(worldPos(trunk), worldPos(pTrunk)) : Infinity;
ok('F1d nothing moves: foliage and trunk vertices keep their world positions (1e-4)', dc <= 1e-4 && dt <= 1e-4, `foliage ${dc}, trunk ${dt}`);

const sha = crypto.createHash('sha256').update(fs.readFileSync(PLAIN)).digest('hex');
ok('F2a --canopy alone: no `Crown` node', byName(rp, 'Crown').length === 0);
ok('F2b --canopy alone: byte-identical to the run before --crown existed (pinned sha256)', sha === PLAIN_SHA, `sha256 ${sha}`);

const bad = node([NOCANOPY, ...BASE, '--crown']);
ok('F3 --crown without --canopy exits non-zero with "--crown needs --canopy" and writes nothing', bad.status !== 0 && bad.status !== null && /--crown needs --canopy/.test(bad.stderr) && !fs.existsSync(NOCANOPY));

fs.rmSync(tmp, { recursive: true, force: true });
done();
