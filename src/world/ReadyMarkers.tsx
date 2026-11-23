import type { ItemId } from '../game/config'
import { YIELD_IDS, yieldAmount, type YieldId } from '../game/content/yields'
import { slotKey } from '../game/systems/studio'
import { waitingYields } from '../game/systems/yields'
import { useCoarseNow } from '../hooks/useCoarseNow'
import { useGame } from '../store/game'
import { HIGHLAND, MEADOW, ORCHARD, WETLAND } from './isleSpots'
import { OnIsle, useLocalAt } from './Isles'
import { BEEHIVES, CHICKEN_YARDS, FRUIT_TREES, ISLES, MAIN, WOODSHED, type IsleId, type XZ } from './layout'
import { useMotion, type MotionLevel } from './motion'
import { useSlot } from './slots'
import { WorldLabel, type V3 } from './WorldLabel'

// Ready markers (spec §3): a soft label floats over whatever has output
// waiting to be collected, saying how much: over the hens' yard, the first
// hive, the first fruit tree, the woodshed, the sheep's pasture, the goats'
// terrace and the wetland's lake. They're UI labels, like the visitors', so
// they need no art; the bottom-left card and the garden panel say the same in
// words, and Collect all there brings it in.

/** How far above the ground a marker floats. */
const LIFT = 1.2

type Spot = (
  /** A fixed place on the farm's own piece. */
  | { kind: 'main'; at: XZ }
  /** Over the first of the player's placed things of a kind, followed if it's moved in the studio. */
  | { kind: 'slot'; item: ItemId; home: XZ }
  /** A place on a docked piece, in the piece's own coordinates. */
  | { kind: 'isle'; isle: IsleId; at: XZ }
) & {
  /** Label rows below the point (above, if negative), clear of a neighbour's label (see WorldLabel). */
  row?: number
}

/**
 * Where each kind's marker floats, for what the farm owns. The farm's own
 * markers crowd together at the default camera, most on a phone: the hens'
 * yard sits in front of the first hive, the first hive beside the first fruit
 * tree, and the woodshed, behind the farmhouse, just above the hens' yard on
 * screen, with the goats' terrace above it. So the eggs' label stands a row
 * higher and the fruit's a row lower, the wood's two rows higher, over the
 * eggs', and the milk's a row higher, over the wood's, which leaves each on a
 * line of its own (yields.spec.ts checks it with every kind waiting).
 */
const SPOTS: Record<YieldId, (owned: Record<ItemId, number>) => Spot> = {
  eggs: () => ({ kind: 'main', at: CHICKEN_YARDS[0].center, row: -1 }),
  honey: () => ({ kind: 'slot', item: 'beehive', home: BEEHIVES[0] }),
  // The orchard's trees drop fruit too: over its first row while the farm has no fruit tree of its own.
  fruit: (owned) =>
    owned.fruitTree > 0 ? { kind: 'slot', item: 'fruitTree', home: FRUIT_TREES[0], row: 1 } : { kind: 'isle', isle: 'orchard', at: ORCHARD.rows[0] },
  wood: () => ({ kind: 'main', at: WOODSHED, row: -2 }),
  wool: () => ({ kind: 'isle', isle: 'meadow', at: MEADOW.pasture.at }),
  milk: () => ({ kind: 'isle', isle: 'highland', at: HIGHLAND.goats.at, row: -1 }),
  fish: () => ({ kind: 'isle', isle: 'wetland', at: WETLAND.lake.centre }),
}

interface Marked {
  id: YieldId
  n: number
  motion: MotionLevel
  row?: number
}

/** On the farm's own piece, its height read as it's placed. */
const mainAt = ([x, z]: XZ): V3 => [x, MAIN.height(x, z) + LIFT, z]

function Label({ id, n, motion, row, at }: Marked & { at: V3 }) {
  return (
    <WorldLabel at={at} motion={motion} row={row} testId={`ready-${id}`}>
      {yieldAmount(id, n)}
    </WorldLabel>
  )
}

function OverSlot({ item, home, ...marked }: Marked & { item: ItemId; home: XZ }) {
  const s = useSlot(slotKey(item, 0), home)
  return <Label {...marked} at={mainAt([s.x, s.z])} />
}

/** Drawn inside the piece (see OnIsle), so its ground is read once the piece is in the world. */
function OnPiece({ isle, at, ...marked }: Marked & { isle: IsleId; at: XZ }) {
  const ground = useLocalAt(ISLES[isle])
  return <Label {...marked} at={ground(at, LIFT)} />
}

function Marker({ spot, ...rest }: Marked & { spot: Spot }) {
  const marked = { ...rest, row: spot.row }
  switch (spot.kind) {
    case 'main':
      return <Label {...marked} at={mainAt(spot.at)} />
    case 'slot':
      return <OverSlot {...marked} item={spot.item} home={spot.home} />
    case 'isle':
      return (
        <OnIsle id={spot.isle}>
          <OnPiece {...marked} isle={spot.isle} at={spot.at} />
        </OnIsle>
      )
  }
}

/** A marker over each thing with something waiting to be collected. */
export function ReadyMarkers() {
  const game = useGame((s) => s.game)
  const now = useCoarseNow(5000)
  const motion = useMotion()
  const waiting = waitingYields(game, now)
  return (
    <group>
      {YIELD_IDS.filter((id) => waiting[id] > 0).map((id) => (
        <Marker key={id} id={id} n={waiting[id]} motion={motion} spot={SPOTS[id](game.owned)} />
      ))}
    </group>
  )
}
