// How the composition's meshes are lit (Composed.tsx). Kept free of imports, so the art pipeline's fir look test
// (art/scripts/tests/firlook.browser.mjs) reads the same rules.

/**
 * Whether a composed mesh takes the shadows cast on it: `canopy` marks a tree's
 * crown, `conifer` a model with a `Crown` node. Everything does but a
 * conifer's canopy: a fir's fronds stack tier on tier, and each tier took the
 * shadow of the one above as dark bands across the crown (the owner,
 * 2026-10-25: "blotchy"). A broadleaf's crown, one mass of small cards, keeps
 * its shadows; on it they read as depth.
 */
export function receivesShadow(category: string, canopy: boolean, conifer: boolean): boolean {
  return !(category === 'trees' && canopy && conifer)
}

/**
 * Whether a composed mesh's two-sided leaves are lit on their backs as on their
 * fronts (assetMaterials.ts backLit): a conifer's canopy. three turns the
 * normal round on a face seen from behind, and a fir frond seen from below then
 * faced the brown ground light and drew as a black sliver through the crown.
 * A broadleaf's leaves are two-sided by duplicated faces already, both sides
 * lit as their front.
 */
export function backLitAsFront(category: string, canopy: boolean, conifer: boolean): boolean {
  return category === 'trees' && canopy && conifer
}
