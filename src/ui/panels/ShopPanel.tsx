import { useState } from 'react'
import { availableCrops, shopCatalogue } from '../../game/available'
import { CROPS, ITEMS, type CropId } from '../../game/config'
import { buySeeds, harvestValue, isCropUnlocked } from '../../game/engine'
import { isOn } from '../../game/features'
import { levelForXp } from '../../game/progression'
import { useGame } from '../../store/game'
import { CropArt } from '../Art'
import { ItemCard } from '../ItemCard'
import { duration, num } from '../format'
import { Icon } from '../Icon'
import { Panel, Tabs } from '../Panel'

type ShopTab = 'seeds' | 'decor' | 'animals'

function SeedRow({ crop }: { crop: CropId }) {
  const game = useGame((s) => s.game)
  const run = useGame((s) => s.run)
  const def = CROPS[crop]
  const unlocked = isCropUnlocked(game, crop)
  const lockedBy =
    levelForXp(game.xp) < def.unlockLevel
      ? `Unlocks at level ${def.unlockLevel}.`
      : def.requires
        ? `Grows once you have the ${ITEMS[def.requires].name.toLowerCase()}.`
        : ''
  return (
    <li className={`item ${unlocked ? '' : 'item--locked'}`} data-testid={`seed-${crop}`}>
      <div className="item__art">{unlocked ? <CropArt crop={crop} size={34} /> : <Icon name="lock" size={26} />}</div>
      <div className="item__body">
        <div className="item__title">
          <strong>{def.name}</strong>
          {game.seeds[crop] > 0 && <span className="pill">×{game.seeds[crop]}</span>}
        </div>
        <p className="item__blurb">{unlocked ? def.blurb : lockedBy}</p>
        {unlocked && (
          <p className="item__effect">
            Grows in {duration(def.growMinutes * 60_000)} · sells for {harvestValue(game, crop)}, or {harvestValue(game, crop, true)} in fresh soil
          </p>
        )}
        <div className="item__foot">
          <span className="price">
            <span>
              <Icon name="coin" size={16} />
              {num(def.seedCost)}
            </span>
          </span>
          <span className="btn-group">
            {[1, 5].map((q) => (
              <button
                key={q}
                className="btn btn--small btn--primary"
                disabled={!unlocked || game.coins < def.seedCost * q}
                onClick={() => run((s, now) => buySeeds(s, crop, q, now))}
                data-testid={`buy-seed-${crop}-${q}`}
              >
                Buy {q}
              </button>
            ))}
          </span>
        </div>
      </div>
    </li>
  )
}

/** Things the shop sells; workbench crafts are made, not bought. Things of switched-off features aren't listed. */
const forSale = (category: 'decor' | 'animal') => shopCatalogue(category)

export function ShopPanel() {
  const [tab, setTab] = useState<ShopTab>('seeds')
  return (
    <Panel title="Shop" icon="shop" testId="panel-shop">
      <Tabs
        label="Shop sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'seeds', label: 'Seeds' },
          { id: 'decor', label: 'Garden & decor' },
          { id: 'animals', label: 'Animals' },
        ]}
      />
      <ul className="items">
        {tab === 'seeds' && availableCrops().map((c) => <SeedRow key={c} crop={c} />)}
        {tab === 'decor' && forSale('decor').map((id) => <ItemCard key={id} id={id} />)}
        {tab === 'animals' && forSale('animal').map((id) => <ItemCard key={id} id={id} />)}
      </ul>
      {tab === 'decor' && isOn('workshop') && (
        <p className="hint">
          <Icon name="hammer" size={14} /> Birdhouses, planters and other wooden things are made at the workbench, in Stores.
        </p>
      )}
      {tab === 'animals' && <p className="hint">Animals look after themselves. Nobody needs feeding, ever.</p>}
    </Panel>
  )
}
