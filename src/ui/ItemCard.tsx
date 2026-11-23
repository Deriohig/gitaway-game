import { ITEMS, type ItemCategory, type ItemId } from '../game/config'
import { buyBlock, buyBlockReason, buyItem, itemMax, itemPrice } from '../game/engine'
import { useGame } from '../store/game'
import { ItemArt } from './Art'
import { num } from './format'
import { Icon } from './Icon'

function verb(category: ItemCategory, owned: number): string {
  if (category === 'animal') return 'Adopt'
  if (category === 'land') return 'Expand'
  if (category === 'building') return owned > 0 ? 'Add another' : 'Build'
  return owned > 0 ? 'Add another' : 'Add'
}

/** One thing you can add to the island, with the price of the next one and a buy button. */
export function ItemCard({ id }: { id: ItemId }) {
  const game = useGame((s) => s.game)
  const run = useGame((s) => s.run)
  const openPanel = useGame((s) => s.openPanel)
  const def = ITEMS[id]
  const price = itemPrice(game, id)
  const block = buyBlock(game, id)
  const owned = game.owned[id]
  const max = itemMax(game, id)
  const locked = block === 'level' || block === 'requires' || block === 'bundles'

  const label: Record<NonNullable<typeof block>, string> = {
    workbench: 'At the workbench',
    level: `Level ${def.unlockLevel}`,
    requires: `Needs ${def.requires ? ITEMS[def.requires].name.toLowerCase() : ''}`,
    bundles: def.requiresBundles ? `${def.requiresBundles} restorations` : 'A restoration',
    max: id === 'plot' ? 'Garden full' : def.max === 1 ? 'Built' : 'All placed',
    coins: `${num(price.coins - game.coins)} more coins`,
    wood: `${num(price.wood - game.wood)} more wood`,
  }

  return (
    <li className={`item ${locked ? 'item--locked' : ''}`} data-testid={`item-${id}`}>
      <div className="item__art">{locked ? <Icon name="lock" size={26} /> : <ItemArt item={id} size={34} />}</div>
      <div className="item__body">
        <div className="item__title">
          <strong>{def.name}</strong>
          {max > 1 && owned > 0 && (
            <span className="pill" title="Owned">
              {owned}/{max}
            </span>
          )}
        </div>
        <p className="item__blurb">{locked && block ? buyBlockReason(id, block) : def.blurb}</p>
        {def.effect && !locked && <p className="item__effect">{def.effect}</p>}
        <div className="item__foot">
          {/* Nothing more can be added, so there's no price to show: land's is the next piece's, not this one's. */}
          {block !== 'max' && (
            <span className="price">
              {price.coins > 0 && (
                <span>
                  <Icon name="coin" size={16} />
                  {num(price.coins)}
                </span>
              )}
              {price.wood > 0 && (
                <span>
                  <Icon name="wood" size={16} />
                  {num(price.wood)}
                </span>
              )}
            </span>
          )}
          <button
            className="btn btn--small btn--primary"
            disabled={block !== null}
            onClick={() => {
              // New land rises into place out of the clouds: close the panel so it can be seen (on a phone it covers the view).
              if (run((s, now) => buyItem(s, id, now)) && def.category === 'land') openPanel(null)
            }}
            data-testid={`buy-${id}`}
          >
            {block ? label[block] : verb(def.category, owned)}
          </button>
        </div>
      </div>
    </li>
  )
}
