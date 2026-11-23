// node meshy/probe_glass.mjs <meshy.glb> : HSV of every face the loose glass rule catches, with face normal + centroid
import { NodeIO } from '@gltf-transform/core';
import jpeg from 'jpeg-js';
const doc = await new NodeIO().read(process.argv[2]);
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const tex = prim.getMaterial().getBaseColorTexture();
const img = jpeg.decode(Buffer.from(tex.getImage()), { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
const W = img.width, H = img.height, px = img.data;
const texel = (u, v) => { const x = Math.min(W - 1, Math.max(0, Math.floor(u * W))), y = Math.min(H - 1, Math.max(0, Math.floor(v * H))), o = (y * W + x) * 4; return [px[o], px[o + 1], px[o + 2]]; };
const hsv = ([r, g, b]) => { const mxv = Math.max(r, g, b), mnv = Math.min(r, g, b), d = mxv - mnv; let h = 0;
  if (d) { if (mxv === r) h = ((g - b) / d) % 6; else if (mxv === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; } return [h, mxv ? d / mxv : 0, mxv / 255]; };
const loose = (c) => { const [h, s, v] = hsv(c); return v >= 0.62 && s >= 0.5 && h >= 30 && h <= 58; };
const I = prim.getIndices().getArray(), U = prim.getAttribute('TEXCOORD_0').getArray(), P = prim.getAttribute('POSITION').getArray();
const BARY = [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]];
for (let t = 0; t < I.length / 3; t++) {
  const ii = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]]; const cs = BARY.map(([a, b, c]) => texel(a * U[ii[0] * 2] + b * U[ii[1] * 2] + c * U[ii[2] * 2], a * U[ii[0] * 2 + 1] + b * U[ii[1] * 2 + 1] + c * U[ii[2] * 2 + 1]));
  const hits = cs.filter(loose).length; if (hits < 3) continue;
  const m = cs.map(hsv).reduce((s, x) => s.map((v, k) => v + x[k] / 4), [0, 0, 0]);
  const v = ii.map((i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
  const ux = v[1][0] - v[0][0], uy = v[1][1] - v[0][1], uz = v[1][2] - v[0][2], wx = v[2][0] - v[0][0], wy = v[2][1] - v[0][1], wz = v[2][2] - v[0][2];
  const n = [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx], l = Math.hypot(...n) || 1;
  const c = [0, 1, 2].map((k) => (v[0][k] + v[1][k] + v[2][k]) / 3);
  console.log('t' + t, 'h', m[0].toFixed(0), 's', m[1].toFixed(2), 'v', m[2].toFixed(2), 'n', n.map((x) => (x / l).toFixed(2)).join(','), 'c', c.map((x) => x.toFixed(3)).join(','));
}
