import type { GameState } from '../game/state'
import { composes } from './composition'
import { visibleIsles } from './framing'
import { GROVE, ORCHARD } from './isleSpots'
import { FRUIT_TREES, ISLES, STATIC_TREES, byDockedRim } from './layout'

/**
 * How many trees the world draws for a farm, for the Farm panel: the farm's
 * own trees (less any making way for a docked piece, as MainIsland leaves
 * them out), the fruit trees planted in their slots, the meadow's tree, the
 * grove's clumps and its big tree, the orchard's fruit trees, and `composed`,
 * the trees the art's composition draws (as Composed.tsx reports them). Where
 * the composition is drawn, the meadow's tree and the grove's clumps make way
 * for its own.
 */
export function treeCount(game: GameState, composed = 0): number {
  const docked = visibleIsles(game)
  const own = STATIC_TREES.filter((t) => !byDockedRim(t.at, docked)).length
  const fruit = Math.min(game.owned.fruitTree, FRUIT_TREES.length)
  const meadow = docked.includes('meadow') && !composes('meadow', 'trees', ISLES.meadow.island) ? 1 : 0
  const grove = docked.includes('grove') ? 1 + (composes('grove', 'trees', ISLES.grove.island) ? 0 : GROVE.trees.length) : 0
  const orchard = docked.includes('orchard') ? ORCHARD.rows.length : 0
  return own + fruit + meadow + grove + orchard + composed
}
