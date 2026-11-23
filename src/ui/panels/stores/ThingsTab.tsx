import { availableCrops, availableItems } from '../../../game/available'
import { CROPS, ITEMS } from '../../../game/config'
import { useGame } from '../../../store/game'
import { CropArt, ItemArt } from '../../Art'
import { num } from '../../format'
import { Icon } from '../../Icon'
import { Section } from '../../Panel'

/** The wallet, the seed shed, the pantry and what's on the island. */
export function ThingsTab() {
  const game = useGame((s) => s.game)
  const open = useGame((s) => s.openPanel)
  const crops = availableCrops()
  const seeds = crops.filter((c) => game.seeds[c] > 0)
  const harvested = crops.filter((c) => (game.stats.harvested[c] ?? 0) > 0)
  const owned = availableItems().filter((id) => id !== 'plot' && ITEMS[id].category !== 'land' && game.owned[id] > 0)

  return (
    <>
      <ul className="stats-row" aria-label="Wallet">
        <li>
          <Icon name="coin" size={24} />
          <strong>{num(game.coins)}</strong>
          <span>coins</span>
        </li>
        <li>
          <Icon name="wood" size={24} />
          <strong>{num(game.wood)}</strong>
          <span>wood</span>
        </li>
        <li>
          <Icon name="seed" size={24} />
          <strong>{num(Object.values(game.seeds).reduce((a, b) => a + b, 0))}</strong>
          <span>seeds</span>
        </li>
      </ul>

      <Section
        title="Seed shed"
        aside={
          seeds.length > 0 && (
            <button className="link" onClick={() => open('garden')}>
              Plant
            </button>
          )
        }
      >
        {seeds.length ? (
          <ul className="tiles">
            {seeds.map((c) => (
              <li key={c} className="tile" title={CROPS[c].name}>
                <CropArt crop={c} size={30} />
                <span>×{game.seeds[c]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">Empty. Seeds are in the shop.</p>
        )}
      </Section>

      <Section title="Pantry">
        {harvested.length ? (
          <ul className="tiles">
            {harvested.map((c) => (
              <li key={c} className="tile" title={`${CROPS[c].plural} harvested`}>
                <CropArt crop={c} size={30} />
                <span>{game.stats.harvested[c]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">Nothing harvested yet. Everything you pick is remembered here.</p>
        )}
      </Section>

      <Section title="On the island">
        <ul className="tiles">
          {owned.map((id) => (
            <li key={id} className="tile" title={ITEMS[id].name}>
              <ItemArt item={id} size={30} />
              <span>{game.owned[id]}</span>
            </li>
          ))}
          {game.gifts.map((g) => (
            <li key={g} className="tile" title={g === 'cat' ? 'The cat' : 'The dog'}>
              <Icon name="paw" size={30} />
              <span>{g}</span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  )
}
