import { isOn } from '../game/features'
import { DOCK_IDS, PIECES, dockedAt, type DockId } from './blueprint'
import { fallbackIsland, swappable, type DockedIsland } from './pieces'
import { CAMP, CAMP_STAND, CHARACTER_BLOCKERS } from './places/characters'
import { RESTORATION_BLOCKERS } from './places/restoration'
import { WORKSHOP_BLOCKERS } from './places/workshop'
import { footprintDrop } from './terrain'

// Where everything sits. The camera looks from +x/+z towards the origin, so
// "far" (top of the screen) is -x/-z. Tall things live on the far side so
// they never hide the garden; low things live near the camera.

export type XZ = [number, number]

/** Whether the slots the art's path ribbons cross stand aside for them (see `aside`). Read once, as the game starts. */
const RIBBONS = isOn('composition')

/**
 * A slot that stands aside for the art's path ribbons while its composition
 * is drawn (features.ts): `now` then, as the composition's JSON resolves the
 * ribbon running over it ("game moves ..." in its `conflicts`), and `was`, where
 * it always stood, with the composition off.
 */
export const aside = <T,>(was: T, now: T): T => (RIBBONS ? now : was)

/**
 * The farm's own island, the centre piece of the blueprint (art/BLUEPRINT.md).
 * Its ground is the baked piece once that has loaded (see pieceLoader.ts),
 * the procedural island otherwise. Read its height at the moment something is
 * placed, never once at start-up: the world waits for the pieces before it
 * places anything, so that is always the ground that's drawn.
 */
export const MAIN: DockedIsland = swappable(() => fallbackIsland('main'))

export const HOUSE = { x: -4.0, z: -2.0, rot: Math.PI / 4 }
/** A point in the farmhouse's own frame (it stands turned by HOUSE.rot, its door on +Z) as a place on the main island. */
export function byHouse(x: number, z: number): XZ {
  const a = HOUSE.rot
  return [HOUSE.x + x * Math.cos(a) + z * Math.sin(a), HOUSE.z - x * Math.sin(a) + z * Math.cos(a)]
}
/**
 * How high the farmhouse model's porch deck is above the ground at the house's own spot. In the house's
 * frame the deck runs 1.0 wide (x −0.75 to 0.25) and 0.5 deep (z 1.07, the front wall, to 1.57), with a
 * porch post on it at each end of the door's side (x −0.62 and 0.07, z 1.38).
 */
export const PORCH_DECK = 0.216
/**
 * Where the cat naps: on the porch deck before the door, between the posts. The deck is barely deeper
 * than the curled cat, so it lies square to the house, turned by `face` (rotation.y) so its sleeping
 * face (the model's +X) looks straight out from the door, at the camera.
 */
export const CAT_NAP = {
  at: byHouse(-0.275, 1.32),
  face: HOUSE.rot - Math.PI / 2,
  /** The height it lies at, on the deck. Read when it's placed, like any height on MAIN. */
  get y(): number {
    return MAIN.height(HOUSE.x, HOUSE.z) + PORCH_DECK
  },
}

/**
 * How the porch cat holds its head: at rest while it sleeps, and tilted chin-up (rotation.z about the
 * head's pivot; positive raises its +X face) when it is woken. Its head is set into the curled body, so
 * lifting it would show the whole flat cut where they meet; tilting shows only a little, under the chin.
 */
export const catHead = (awake: boolean): { tilt: number; lift: number } => ({ tilt: awake ? 0.3 : 0, lift: 0 })

export const GARDEN = { x0: 0.45, z0: -1.6, cell: 1.12, plot: 0.94 }
/** Plot slots in the order they are unlocked: a 2×2 bed that grows to 4×4. */
export const PLOT_SLOTS: [number, number][] = [
  [0, 0], [1, 0], [0, 1], [1, 1],
  [2, 0], [2, 1], [0, 2], [1, 2], [2, 2],
  [3, 0], [3, 1], [3, 2], [0, 3], [1, 3], [2, 3], [3, 3],
]
export function plotCenter(index: number): XZ {
  const [col, row] = PLOT_SLOTS[index] ?? [0, 0]
  return [GARDEN.x0 + GARDEN.cell * (col + 0.5), GARDEN.z0 + GARDEN.cell * (row + 0.5)]
}
const GX1 = GARDEN.x0 - 0.28
const GX2 = GARDEN.x0 + GARDEN.cell * 4 + 0.28
const GZ1 = GARDEN.z0 - 0.28
const GZ2 = GARDEN.z0 + GARDEN.cell * 4 + 0.28

/** Where chickens scratch about: the first four by the farmhouse, the rest between the lanterns and the pond. */
export const CHICKEN_YARDS: { center: XZ; radius: number }[] = [
  { center: [-1.5, -1.7], radius: 1.5 },
  { center: [-3.0, 1.6], radius: 1.0 },
]
/** Where the dog trots about, by the path to the pond. */
export const DOG_YARD: { center: XZ; radius: number } = { center: [-1.2, 1.5], radius: 1.3 }

/** The farm's pond and stream as the blueprint gives them (main.water, in world x and z). */
interface FarmWater {
  pond: { outline: XZ[]; level: number }
  stream: { line: { x: number; z: number; level: number; width: number }[] }
}
const FARM_WATER = PIECES.main.water as unknown as FarmWater

/**
 * The pond's shore. The art session owns the farm's pond and stream since water revision 1
 * (art/specs/2026-10-23-water-revamp-design.md, Revision 1): the Teardrop, a round pond that
 * tapers north-west into its stream. The shore closes on the cap line where the stream leaves it.
 */
export const POND_SHORE: readonly XZ[] = FARM_WATER.pond.outline
/** The height of the pond's surface (the baked water's, in MAIN's frame): what its lily pads float on. */
export const POND_LEVEL: number = FARM_WATER.pond.level
/** The stream's middle line from inside the pond's neck to the rim: where it runs, its water's height and its width. */
export const STREAM_LINE: readonly { at: XZ; level: number; width: number }[] = FARM_WATER.stream.line.map(({ x, z, level, width }) => ({ at: [x, z], level, width }))

/** The pond's open middle, about the widest circle inside its shore (whose radius is 1.37): the ducks paddle round it. */
export const POND = { x: -1.75, z: 4.57, r: 1.35 }
/**
 * The pond Water.tsx draws, as it always has: a blob of this radius round this middle, with the
 * stream running from it at STREAM_THETA. It stays the farm's water until the baked water, drawn
 * to the art's shore, replaces it. The blueprint keeps its record (main.water.pond.legacy).
 */
export const LEGACY_POND = { x: -1.7, z: 4.3, r: 1.45 }
/** How far the ground kept clear round the water reaches past it, at most. */
const WATER_ROOM = 0.45
/**
 * The ground kept clear round the pond and its stream (BLOCKERS), at least 0.3 deep over every
 * part of the water and reaching no more than WATER_ROOM past it: four discs over the Teardrop,
 * each the widest circle at its middle and WATER_ROOM more, then one every few points down the
 * stream, half its width and WATER_ROOM more. They cover the pond Water.tsx draws until then too.
 */
export const WATER_BLOCKERS: Blocker[] = [
  { at: [-1.7, 4.51], r: 1.81 },
  { at: [-2.32, 5.16], r: 1.65 },
  { at: [-2.72, 5.33], r: 1.46 },
  { at: [-3.55, 5.7], r: 1.06 },
  ...STREAM_LINE.filter((_, i) => i % 4 === 0 || i === STREAM_LINE.length - 1).map((p) => ({ at: p.at, r: p.width / 2 + WATER_ROOM })),
]
/** The stream runs from the pond to the rim and over the edge as a waterfall. */
export const STREAM_THETA = 2.42
export const WINDMILL: XZ = [0.7, -5.5]
/** The windmill's door (+Z) faces the end of its stone path at (0.85, -4.3), as the art places it. */
export const WINDMILL_ROT = 0.124
/**
 * How far lower the windmill stands, on the lowest ground under its round
 * base. Read when it's placed, like any height on MAIN: the farm's ground is
 * only known once its piece has loaded.
 */
export const windmillDrop = (): number => footprintDrop(MAIN, WINDMILL[0], WINDMILL[1], 0.8)
export const GREENHOUSE = { x: 3.8, z: -4.25, rot: -0.12 }
/**
 * The woodshed, a lean-to by the farmhouse: back right of the house, beside the log stack along its
 * side, square to it in its corner (the owner's spot B). It stands nearer the house than their two
 * round grounds (BLOCKERS) allow, but its own footprint clears the house's eaves by about 0.12 and
 * the end of the log stack by about 0.05; its ground keeps clear of everything else: the slots, the
 * paths, and the art's ribbon to the highland, 1.29 from it (placement.test.ts).
 */
export const WOODSHED: XZ = byHouse(2.0, -1.2)
/** The woodshed's turn (rotation.y): square to the farmhouse, its open front (+Z) to the camera as the door is. */
export const WOODSHED_ROT = HOUSE.rot
/** How far lower the woodshed stands, on the lowest ground under its posts. Read when it's placed, like any height on MAIN. */
export const woodshedDrop = (): number => footprintDrop(MAIN, WOODSHED[0], WOODSHED[1], 0.65, 0.4, WOODSHED_ROT)
export const WELL: XZ = [-6.1, 0.9]
/** The well stands turned an eighth, as the art places it. */
export const WELL_ROT = Math.PI / 4
const [BENCH_X, BENCH_Z] = aside<XZ>([0.65, 5.75], [0.2, 5.77])
export const BENCH = { x: BENCH_X, z: BENCH_Z, rot: -2.1 }
export const SCARECROW: XZ = [5.45, 3.4]
/**
 * How large the scarecrow model is drawn. It is made 1.45 tall with arms 1.25 across, and its slot
 * stands between two fruit trees with their crowns 1.05 apart along its arms: at three quarters its
 * arms (0.94 across, near the brief's 0.85) keep out of them, and it stands 1.09 tall.
 */
export const SCARECROW_SCALE = 0.75
/** The scarecrow's turn (rotation.y): facing the camera, its arms across the view. */
export const SCARECROW_TURN = Math.PI / 4

// Default slots for things bought more than once, in the order they're placed.
// There is one slot for every unit an item's `max` allows.
export const LANTERNS: XZ[] = [[-2.3, 0.75], [-0.15, 0.05], [-2.95, 2.75], aside([0.85, 4.85], [0.45, 4.6]), [-1.35, 1.65], [-4.2, 1.05]]
export const FLOWERBEDS: XZ[] = [
  aside([-5.4, 0.15], [-5.0, 1.22]),
  aside([-2.15, -3.35], [-1.33, -5.6]),
  // The eighth stood at (−3.4, 5.5), where the art's stream now runs: it stands on the open lawn south of the pond.
  [5.75, 1.0], [2.6, 3.95], [1.7, -2.65], [-4.35, 2.55], [0.2, -3.3], [-1.5, 7.75],
]
export const FRUIT_TREES: XZ[] = [aside([6.25, -1.7], [5.77, -2.3]), [6.7, 0.35], [6.1, 2.55], [4.75, 4.6], [2.9, 5.7], aside([1.1, 6.8], [0.95, 6.95]), [-4.8, 4.6], [-0.4, -6.7]]
export const BEEHIVES: XZ[] = [[5.0, -2.55], [5.75, -3.45], [6.45, -2.75]]

/** Fence runs around the garden, with a gate on the west side for the path. */
export const FENCE_RUNS: [XZ, XZ][] = [
  [[GX1, GZ1], [GX2, GZ1]],
  [[GX2, GZ1], [GX2, GZ2]],
  [[GX2, GZ2], [GX1, GZ2]],
  [[GX1, GZ2], [GX1, 1.25]],
  [[GX1, -0.15], [GX1, GZ1]],
]

/**
 * The little fence by the farmhouse that comes with the farm: none for now.
 * It ran from (−6.9, −2.3) to (−6.0, −4.4), straight through the hero tree's
 * trunk at (−6.4, −3.6), and on to (−4.9, −4.9) between that tree and the
 * pine at (−4.7, −5.6). It started 1.39 u from the hero tree with the pine at
 * (−7.3, −1.1) on its line behind, so no stretch of it kept the 1.5 u fences
 * keep from trees (placement.test.ts). It served no gate or path. The art
 * session's composition pass places it again.
 */
export const HOME_FENCE: [XZ, XZ][] = []

/**
 * Stepping-stone trails, added one at a time. The one to the well stops at
 * its bend while the composition is drawn: the art's ribbon to the cottage
 * starts there and runs north of the well.
 */
export const STONE_PATHS: XZ[][] = [
  [[2.2, 3.55], [1.75, 4.4], [1.2, 5.1]],
  aside<XZ[]>([[-4.6, -0.55], [-5.25, 0.05], [-5.65, 0.55]], [[-4.6, -0.55], [-5.25, 0.05]]),
  [[1.35, -2.05], [1.05, -3.2], [0.85, -4.3]],
  [[3.4, -2.05], [3.55, -2.75], [3.7, -3.2]],
]

/** The dirt path forks from the door to the garden gate and to the pond. */
export const DIRT_PATHS: XZ[][] = [
  [[-2.85, -0.85], [-1.9, 0.05], [-0.85, 0.45], [0.2, 0.55]],
  [[-1.9, 0.05], [-1.95, 1.4], [-1.85, 2.75]],
]

/**
 * Decorative trees that are always there. Kind: r = round, p = pine. Each
 * keeps its own seed, so dropping one leaves the others as they were. (The
 * pine that stood at (−6.2, −5.6) went: it was past the baked island's rim.)
 */
export const STATIC_TREES: { at: XZ; s: number; kind: 'r' | 'p'; seed: number }[] = [
  { at: [-6.4, -3.6], s: 1.55, kind: 'r', seed: 1 },
  { at: [-4.7, -5.6], s: 1.6, kind: 'p', seed: 2 },
  { at: aside([-2.4, -6.4], [-2.08, -6.63]), s: 1.35, kind: 'r', seed: 3 },
  { at: [-7.3, -1.1], s: 1.25, kind: 'p', seed: 4 },
  { at: aside([-1.3, -4.5], [-0.88, -4.55]), s: 0.95, kind: 'r', seed: 6 },
  { at: [-5.8, 3.4], s: 1.2, kind: 'r', seed: 7 },
  { at: aside([3.3, -6.5], [3.47, -6.43]), s: 1.15, kind: 'p', seed: 8 },
  { at: aside([7.1, -3.6], [6.85, -3.7]), s: 0.95, kind: 'r', seed: 9 },
]

/** The first static tree is the hero tree: its model stands turned an eighth, its broad side to the camera. */
export const HERO_ROT = Math.PI / 4
/** How far round its trunk the ground is read for the hero tree model's roots (they reach 1.85 out; the lowest ground is within this). */
const HERO_ROOT_REACH = 1.5
/**
 * How far the hero tree's root flare settles into the slope, so no root
 * floats above the lowest ground under it. Read when it's placed, on the
 * farm's ground as drawn (the baked piece's height grid once it has loaded).
 */
export const heroSink = (): number => footprintDrop(MAIN, STATIC_TREES[0].at[0], STATIC_TREES[0].at[1], HERO_ROOT_REACH)

/**
 * The farm's bushes. The second stood at (−3.5, −4.2) until the woodshed took that spot; it now grows
 * behind the farmhouse, between the woodshed and the big tree. It and the seventh, behind the big tree,
 * keep their feet off the tree's root flare (placement.test.ts), each moved straight out from the trunk
 * and still clear of the pine's slot beside them (the seventh stood on the roots at (−6.0, −5.0)).
 */
export const BUSHES: XZ[] = [[-6.6, 2.3], [-4.76, -4.48], aside([1.9, -6.1], [1.3, -6.8]), [6.6, 4.0], [-0.4, 6.6], [4.1, 6.4], [-5.91, -5.33], [7.4, 1.8]]

/** How the farm's bush BUSHES[i] looks: its size, its seed (its model and its turn), and whether it flowers (every other one does). */
export const bushLook = (i: number): { scale: number; seed: number; flowers: boolean } => ({ scale: 0.9 + (i % 3) * 0.2, seed: i + 4, flowers: i % 2 === 0 })

/** Rocks that are always there, and how big. */
export const ROCKS: { at: XZ; s: number }[] = [
  { at: aside([-7.6, 1.4], [-7.45, 1.35]), s: 0.32 },
  { at: [-7.1, 1.9], s: 0.18 },
  { at: [7.6, -1.0], s: 0.26 },
  { at: aside([2.0, 7.2], [1.72, 7.52]), s: 0.24 },
  { at: [-2.8, 7.0], s: 0.3 },
  { at: [5.6, -5.4], s: 0.22 },
]

/**
 * Every slot's keep-clear disc where it stands, as the art session measures
 * them (a tree's grows with its size): the art's composition keeps off them.
 */
export const SLOT_DISCS: Blocker[] = [
  ...FRUIT_TREES.map((at) => ({ at, r: 0.55 })),
  ...FLOWERBEDS.map((at) => ({ at, r: 0.6 })),
  ...LANTERNS.map((at) => ({ at, r: 0.3 })),
  ...BEEHIVES.map((at) => ({ at, r: 0.35 })),
  ...BUSHES.map((at) => ({ at, r: 0.45 })),
  ...STATIC_TREES.map((t) => ({ at: t.at, r: 0.3 + 0.2 * t.s })),
  ...ROCKS.map((rock) => ({ at: rock.at, r: 0.4 })),
  { at: [BENCH.x, BENCH.z], r: 0.6 },
  { at: SCARECROW, r: 0.4 },
  // Barnaby's camp, and where he stands by it (places/characters.ts).
  { at: CAMP, r: 0.75 },
  { at: CAMP_STAND, r: 0.3 },
]

/** An unlock piece, as the world draws it: its ground, and where its origin sits once docked. */
export interface IsleDef {
  island: DockedIsland
  pos: [number, number, number]
}

/**
 * The unlock pieces of the blueprint, each at its docked position against
 * MAIN's rim (art/config/blueprint.pieces.json). Their ground is the baked
 * piece once loaded, a procedural one cut to the same outline otherwise. A
 * spot on one is in its own coordinates: `useLocalAt` (Isles.tsx) stands
 * things on its ground. The camera frames whichever are in the world (see
 * framing.ts).
 */
export const ISLES = Object.fromEntries(
  DOCK_IDS.map((id) => [id, { island: swappable(() => fallbackIsland(id)), pos: PIECES[id].dockedPosition }]),
) as Record<DockId, IsleDef>

export type IsleId = DockId

/** How close to MAIN's rim counts as by the edge: rim scatter there gives way to a piece docked alongside. */
export const RIM_BAND = 1.0

/** How far a point is inside MAIN's rim (negative past it). */
export function insideRim(x: number, z: number): number {
  return MAIN.outline(Math.atan2(z, x)) - Math.hypot(x, z)
}

/** Whether a spot on MAIN is by the edge where one of the given pieces is docked (so things there make way for it). */
export function byDockedRim([x, z]: XZ, docked: readonly IsleId[], band = RIM_BAND): boolean {
  return insideRim(x, z) < band && dockedAt(Math.atan2(z, x), docked) !== null
}

export interface Blocker {
  at: XZ
  r: number
}

/**
 * Areas animals, props and moved things keep clear of on the main island.
 * Features that build on the main island list their own areas in
 * ./places/<feature>.ts, so they never edit this file.
 */
export const BLOCKERS: Blocker[] = [
  { at: [HOUSE.x, HOUSE.z], r: 1.9 },
  { at: [GARDEN.x0 + GARDEN.cell * 2, GARDEN.z0 + GARDEN.cell * 2], r: 2.9 },
  ...WATER_BLOCKERS,
  { at: WINDMILL, r: 1.2 },
  { at: [GREENHOUSE.x, GREENHOUSE.z], r: 1.6 },
  { at: WELL, r: 0.8 },
  { at: WOODSHED, r: 0.65 },
  ...WORKSHOP_BLOCKERS,
  ...RESTORATION_BLOCKERS,
  ...CHARACTER_BLOCKERS,
]

export function isClear(x: number, z: number, pad = 0): boolean {
  return BLOCKERS.every((b) => Math.hypot(x - b.at[0], z - b.at[1]) > b.r + pad)
}
