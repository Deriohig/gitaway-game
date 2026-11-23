import * as THREE from 'three'
import { PALETTE, type PaletteKey } from './palette'

// The animals that come in more than one coat, picked by each one's seed. The
// stand-ins are drawn in the coat's colours. A model is painted in its palest
// coat, and drawn in the others through `tint`, a colour multiplier for its
// materials (see prepareModel), so it never comes out paler than it's painted.

/** The multiplier that repaints a model painted `from` one colour `to` another (none above 1). */
function repaint(from: string, to: string): THREE.Color {
  const a = new THREE.Color(from)
  const b = new THREE.Color(to)
  return new THREE.Color(Math.min(1, b.r / a.r), Math.min(1, b.g / a.g), Math.min(1, b.b / a.b))
}

/** Chicken coats; the model is painted in the white one. Each tint is made once, so a chicken keeps the same one. */
const CHICKEN_COATS = (['white', 'wallShade', 'gold'] as const).map((standIn) => ({ standIn, tint: repaint(PALETTE.white, PALETTE[standIn]) }))

/** A chicken's coat: `standIn` colours the procedural stand-in, `tint` the model. */
export function chickenCoat(seed: number): { standIn: PaletteKey; tint: THREE.Color } {
  return CHICKEN_COATS[(seed + 2) % 3]
}

/** Goat coats: white, fawn, brown, and grey-black, with a darker face, beard and legs to go with each. The model is painted white. */
const GOAT_COATS: { coat: string; dark: string; tint: THREE.Color }[] = [
  { coat: '#EEE7DA', dark: '#B9AC98' },
  { coat: '#C9A77E', dark: '#7B5E45' },
  { coat: '#8E7260', dark: '#4E3F35' },
  { coat: '#6F6A66', dark: '#3E3A37' },
].map((c, _, all) => ({ ...c, tint: repaint(all[0].coat, c.coat) }))

/** A goat's coat: `coat` and `dark` colour the procedural stand-in, `tint` the model. */
export function goatCoat(seed: number): { coat: string; dark: string; tint: THREE.Color } {
  return GOAT_COATS[(seed * 3 + 1) % GOAT_COATS.length]
}
