import { availableItems } from '../../game/available'
import { ITEMS } from '../../game/config'
import { animalCount, landOwned } from '../../game/engine'
import { useGame } from '../../store/game'
import { useComposedTrees } from '../../world/Composed'
import { treeCount } from '../../world/trees'
import { ItemCard } from '../ItemCard'
import { Icon } from '../Icon'
import { Panel, Section } from '../Panel'

export function FarmPanel() {
  const game = useGame((s) => s.game)
  // Only what's part of the game with the feature switches as they are.
  const items = availableItems()
  const buildings = items.filter((id) => ITEMS[id].category === 'building')
  const land = items.filter((id) => ITEMS[id].category === 'land')
  const isles = landOwned(game)
  const trees = treeCount(game, useComposedTrees())
  const since = new Date(game.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <Panel title={game.farmName} icon="farm" testId="panel-farm">
      <p className="muted small">Est. {since}. Your retirement plan, one commit at a time.</p>
      <ul className="stats-row" aria-label="Island summary">
        <li>
          <strong>{1 + isles}</strong>
          <span>{isles ? 'islands' : 'island'}</span>
        </li>
        <li>
          <strong>{game.plots.length}</strong>
          <span>plots</span>
        </li>
        <li>
          <strong>{trees}</strong>
          <span>trees</span>
        </li>
        <li>
          <strong>{animalCount(game)}</strong>
          <span>animals</span>
        </li>
      </ul>

      <Section title="Buildings">
        <ul className="items">
          {buildings.map((id) => (
            <ItemCard key={id} id={id} />
          ))}
        </ul>
      </Section>
      <Section title="New land">
        <p className="muted small">
          Land rises from the clouds and docks against the farm. Claim pieces in any order: each one makes the next cost more.
        </p>
        <ul className="items">
          {land.map((id) => (
            <ItemCard key={id} id={id} />
          ))}
        </ul>
      </Section>
      <p className="hint">
        <Icon name="info" size={14} /> Smaller touches like flowers, fences and animals are in the shop.
      </p>
    </Panel>
  )
}
