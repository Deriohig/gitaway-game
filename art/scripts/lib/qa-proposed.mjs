// qa-proposed.mjs -- the one switch for the ART-BIBLE rules that began as "proposed (art director)": the saturation / value /
// temperature bands (ART-BIBLE §B.1) and the texel-density, canopy-pivot and neighbour rules (§D.3, ASSET-RULES §3-§5).
// APPROVED by the owner on 2026-10-25 ("Accept all recommendations" on the rules review); the retuned bands are written in
// lib/palette-bands.mjs and lib/asset-contract.mjs. Enforcement is ON: VISUAL-QA V1 (tests/assets.test.mjs: density, canopy pivot,
// neighbours) and V2 (tests/palette.test.mjs: every colour band) block on a value outside a band, except the colours and models
// written down by name in the registers (LEGACY in palette-bands.mjs; KNOWN_DEFECTS, HERO_WALLS, EXCEPTIONS in asset-contract.mjs).
// Set ENFORCE_PROPOSED = false only to survey a retune: both suites then REPORT every value outside a band and never fail on it.
export const ENFORCE_PROPOSED = true;
export const PENDING = 'enforcement switched off for a survey; the bands were approved 2026-10-25';
