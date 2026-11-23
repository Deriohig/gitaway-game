import type { CropId } from '../game/config'

// Heights on a garden plot, in the plot's own frame: y 0 is its foot, where
// Garden.tsx stands it on the ground. The plot model (public/models/plot.glb)
// is a tilled bed inside board edging: the boards' top at about 0.153, the
// furrows' troughs at 0.146 and their crests at 0.177. garden.test.ts measures
// these against the models.

/** Where a plot's crops stand, on its soil: y 0 of every crop model and stand-in. */
export const CROP_Y = 0.16

/**
 * How far each ripe crop reaches above CROP_Y: the top of its crop_<id>_3
 * model, rounded up to the centimetre. The owner caps a crop at 1.2.
 */
const RIPE_TOP: Record<CropId, number> = {
  radish: 0.83,
  carrot: 0.87,
  wheat: 1.2,
  lettuce: 0.43,
  tomato: 1.2,
  sunflower: 1.17,
  pumpkin: 0.34,
  blueberry: 0.68,
  cranberry: 0.37,
  lavender: 0.52,
}

/** The sparkle over a ready plot (Garden.tsx): how far it bobs up and down, and its half height. */
export const SPARKLE = { bob: 0.06, half: 0.11 }

/** Clear air between a ripe crop's top and the sparkle's foot, at the bottom of its bob. */
const SPARKLE_GAP = 0.05

/**
 * The sparkle never floats lower than it did over every crop before the
 * models came: there it clears the short crops' procedural stand-ins
 * (Crops.tsx), which are drawn while a model loads.
 */
const SPARKLE_FLOOR = 0.85

/** How high the middle of the sparkle over a ready plot of `crop` floats: just clear of the ripe crop's top. */
export const sparkleY = (crop: CropId): number => Math.max(SPARKLE_FLOOR, CROP_Y + RIPE_TOP[crop] + SPARKLE_GAP + SPARKLE.bob + SPARKLE.half)

/**
 * The standing water of a cranberry bed (Crops.tsx), in the crops' frame (y 0
 * at CROP_Y): a thin oval sheet just over the furrows' crests, so they show
 * through it rather than poke through it or flicker against it, and inside
 * the boards. `top` is its surface, `depth` how thick it is, `radius` its
 * half widths along x and z.
 */
export const WET_BED = { top: 0.025, depth: 0.006, radius: [0.42, 0.39] as const }
