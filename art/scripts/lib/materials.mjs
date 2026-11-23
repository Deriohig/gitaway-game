// materials.mjs  --  asset material factory. ALL colours/knobs come from the
// single source of truth: art/config/look.config.mjs. No hardcoded hexes here.
//
// Resolves a palette token -> a graded, linear baseColorFactor. The grade mirrors
// the config (global multiplicative saturation + warmth + lightness, plus small
// additive per-group nudges). Scene/terrain colours (in viewer.mjs) use the raw
// palette hex; only these glb materials are graded -- same as V3.
//
// NOTE FOR FINAL ASSETS: doubleSided is a proof-time convenience. For shipping,
// tighten to single-sided with correct CCW winding to roughly halve fill cost.

import LOOK from '../../config/look.config.mjs';

export const PALETTE = LOOK.palette;
const GRADE = LOOK.colorGrade;
const MAT = LOOK.materials;

// token -> group name (greens / flowers / neutrals); unlisted tokens -> neutrals
const KEY_GROUP = new Map();
for (const [name, grp] of Object.entries(GRADE.groups)) {
  for (const k of (grp.keys || [])) KEY_GROUP.set(k, name);
}

// ---- colour helpers -----------------------------------------------------------
function channelToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function hexToSrgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}
function srgbToHsl([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) { case r: h = (g - b) / d + (g < b ? 6 : 0); break; case g: h = (b - r) / d + 2; break; default: h = (r - g) / d + 4; }
    h /= 6;
  }
  return [h, s, l];
}
function hslToSrgb([h, s, l]) {
  if (s === 0) return [l, l, l];
  const hue2rgb = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}
const WARM_ANCHOR = 40 / 360;
function warmHue(h, w) { let d = WARM_ANCHOR - h; if (d > 0.5) d -= 1; if (d < -0.5) d += 1; let nh = h + d * w; if (nh < 0) nh += 1; if (nh > 1) nh -= 1; return nh; }
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Grade a palette hex and return LINEAR [r,g,b] for baseColorFactor.
export function warmedLinear(hex, key) {
  const [h, s, l] = srgbToHsl(hexToSrgb(hex));
  const g = GRADE.global;
  const grp = GRADE.groups[KEY_GROUP.get(key) || 'neutrals'] || { saturation: 0, warmth: 0, lightness: 0 };
  const ns = clamp01(s * (1 + g.saturation) + (grp.saturation || 0));
  const nh = warmHue(h, g.warmth + (grp.warmth || 0));
  const nl = clamp01(l + g.lightness + (grp.lightness || 0));
  return hslToSrgb([nh, ns, nl]).map(channelToLinear);
}

// ---- material factory ---------------------------------------------------------
const caches = new WeakMap();
export function getMaterial(doc, key) {
  let cache = caches.get(doc);
  if (!cache) { cache = new Map(); caches.set(doc, cache); }
  if (cache.has(key)) return cache.get(key);

  let mat;
  if (key === 'Glow') {
    const lin = warmedLinear(PALETTE.Glow);
    mat = doc.createMaterial('Glow')
      .setBaseColorFactor([lin[0], lin[1], lin[2], 1])
      .setEmissiveFactor([lin[0] * MAT.glowEmissive, lin[1] * MAT.glowEmissive, lin[2] * MAT.glowEmissive])
      .setMetallicFactor(0).setRoughnessFactor(MAT.glowRoughness).setDoubleSided(true);
  } else if (key === 'Glass') {
    const lin = warmedLinear(PALETTE.Glass);
    mat = doc.createMaterial('Glass')
      .setBaseColorFactor([lin[0], lin[1], lin[2], MAT.glassAlpha])
      .setAlphaMode('BLEND').setMetallicFactor(0).setRoughnessFactor(MAT.glassRoughness).setDoubleSided(true);
  } else {
    const hex = PALETTE[key];
    if (!hex) throw new Error(`Unknown material key: ${key}`);
    const lin = warmedLinear(hex, key);
    mat = doc.createMaterial(key)
      .setBaseColorFactor([lin[0], lin[1], lin[2], 1])
      .setMetallicFactor(0).setRoughnessFactor(MAT.roughness).setDoubleSided(true);
  }
  cache.set(key, mat);
  return mat;
}

// A painted material: white base colour x one embedded colour texture (sRGB), clamped (an atlas: cells must not wrap), mipmapped,
// matte like the flat ones. spec = { name, mimeType, image } (lib/paintedAtlas.mjs atlasTexture). Never name it Glow / Glass: the
// game swaps those for its own.
export function texturedMaterial(doc, name, spec) {
  if (name === 'Glow' || name === 'Glass') throw new Error(`a painted material may not be named ${name}`);
  const tex = doc.createTexture(spec.name || name).setMimeType(spec.mimeType).setImage(spec.image);
  const mat = doc.createMaterial(name).setBaseColorTexture(tex).setBaseColorFactor([1, 1, 1, 1])
    .setMetallicFactor(0).setRoughnessFactor(MAT.roughness).setDoubleSided(true);
  mat.getBaseColorTextureInfo().setWrapS(33071).setWrapT(33071).setMinFilter(9987).setMagFilter(9729);
  return mat;
}
