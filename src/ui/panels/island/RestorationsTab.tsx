import { itemAvailable } from '../../../game/available'
import type { IslandId } from '../../../game/config'
import { DETAILS, DETAIL_IDS, ISLAND_ORDER, ISLANDS, type DetailId } from '../../../game/content/biomes'
import { BUNDLES, type BundleId, type BundleNeed } from '../../../game/content/bundles'
import { isOn } from '../../../game/features'
import type { GameState } from '../../../game/state'
import {
  bundlesOn,
  conditionHint,
  deposit,
  findDetail,
  isFound,
  isRestored,
  islandOpen,
  needLabel,
  needStatus,
  type NeedStatus,
} from '../../../game/systems/restoration'
import { useGame } from '../../../store/game'
import { CropArt, ItemArt } from '../../Art'
import { num } from '../../format'
import { Icon } from '../../Icon'
import { BundleArt } from './BundleArt'

/** The little picture beside a need. */
function NeedArt({ need }: { need: BundleNeed }) {
  switch (need.kind) {
    case 'crop':
      return <CropArt crop={need.id} size={24} />
    case 'built':
      return <ItemArt item={need.item} size={24} />
    case 'good':
      return <Icon name="pot" size={20} />
    case 'wood':
      return <Icon name="wood" size={20} />
    case 'coins':
      return <Icon name="coin" size={20} />
    default:
      return null
  }
}

function NeedRow({ id, status }: { id: BundleId; status: NeedStatus }) {
  const run = useGame((s) => s.run)
  const { need, index, consumed, met } = status
  const label = needLabel(need)
  const test = `need-${id}-${index}`
  if (!consumed) {
    return (
      <li className={`need need--condition ${met ? 'is-met' : ''}`} data-testid={test} data-met={met}>
        <span className="need__art">
          <NeedArt need={need} />
        </span>
        <span className="need__body">
          <span className="need__label">{label}</span>
          <span className="need__have">{met ? 'Done' : conditionHint(need)}</span>
        </span>
        <span className="need__check" aria-label={met ? 'Done' : 'Not yet'} role="img">
          {met && <Icon name="check" size={14} />}
        </span>
      </li>
    )
  }
  return (
    <li className={`need ${met ? 'is-met' : ''}`} data-testid={test} data-met={met}>
      <span className="need__art">
        <NeedArt need={need} />
      </span>
      <span className="need__body">
        <span className="need__label">{label}</span>
        <span className="need__have" data-testid={`${test}-have`}>
          {met ? `All ${num(status.amount)} brought` : `${num(status.brought)} of ${num(status.amount)} brought · you have ${num(status.have)}`}
        </span>
      </span>
      {met ? (
        <span className="need__check" aria-label="Done" role="img">
          <Icon name="check" size={14} />
        </span>
      ) : (
        <button
          className="btn btn--small btn--primary"
          disabled={status.canBring < 1}
          onClick={() => run((s, now) => deposit(s, id, index, now))}
          aria-label={`Bring ${label.toLowerCase()} to the ${BUNDLES[id].name}`}
          data-testid={`bring-${id}-${index}`}
        >
          Bring
        </button>
      )}
    </li>
  )
}

function BundleCard({ id, game }: { id: BundleId; game: GameState }) {
  const def = BUNDLES[id]
  const done = isRestored(game, id)
  return (
    <li className={`bundle ${done ? 'bundle--done' : ''}`} data-testid={`bundle-${id}`} data-done={done}>
      <div className="bundle__head">
        <div className="bundle__art">
          <BundleArt id={id} done={done} />
        </div>
        <div className="bundle__title">
          <strong>{def.name}</strong>
          {done ? (
            <span className="bundle__status" data-testid={`bundle-${id}-done`}>
              <Icon name="check" size={13} /> Restored
            </span>
          ) : (
            <span className="bundle__xp">+{def.xp} XP</span>
          )}
        </div>
      </div>
      {done ? (
        // The world doesn't draw the changes yet. Once it does (restorations part 2), this can point there again: "You'll find it on the island."
        <p className="bundle__change bundle__change--done">{def.change} Mended, and it stays mended.</p>
      ) : (
        <>
          <p className="bundle__change">
            <span className="muted">When it's mended:</span> {def.change}
          </p>
          <ul className="needs" aria-label={`What the ${def.name} needs`}>
            {needStatus(game, id).map((status) => (
              <NeedRow key={status.index} id={id} status={status} />
            ))}
          </ul>
        </>
      )}
    </li>
  )
}

/** A biome's hidden detail, for anyone who'd rather look closely from here than click the island. */
function Detail({ id, game }: { id: DetailId; game: GameState }) {
  const run = useGame((s) => s.run)
  const def = DETAILS[id]
  if (isFound(game, id)) {
    return (
      <p className="board__detail is-found" data-testid={`detail-${id}-found`}>
        <Icon name="sparkle" size={14} /> {def.title}.
      </p>
    )
  }
  return (
    <p className="board__detail">
      <span>{def.hint}</span>
      <button className="board__look" onClick={() => run((s, now) => findDetail(s, id, now))} data-testid={`detail-${id}`}>
        {def.action}
      </button>
    </p>
  )
}

function IslandBoard({ island, game }: { island: IslandId; game: GameState }) {
  const ids = bundlesOn(island)
  // The hidden details belong to the biomes (C2), so they show only while those are on.
  const detail = isOn('biomes') ? DETAIL_IDS.find((d) => DETAILS[d].island === island) : undefined
  return (
    <section className="board__isle" aria-labelledby={`board-${island}`} data-testid={`board-${island}`}>
      <header className="board__head">
        <h3 id={`board-${island}`}>{ISLANDS[island].name}</h3>
        <span className="muted small">{ISLANDS[island].blurb}</span>
      </header>
      <ul className="bundles">
        {ids.map((id) => (
          <BundleCard key={id} id={id} game={game} />
        ))}
      </ul>
      {detail && <Detail id={detail} game={game} />}
    </section>
  )
}

/** An island whose list is still to come: not on the board yet, and its land is part of the game to claim. */
function toCome(game: GameState, island: IslandId): boolean {
  const land = ISLANDS[island].land
  return !islandOpen(game, island) && land !== null && itemAvailable(land)
}

/** Island → Restorations (B3): the notice board, a card per bundle on each owned island. */
export function RestorationsTab() {
  const game = useGame((s) => s.game)
  const open = ISLAND_ORDER.filter((i) => islandOpen(game, i))
  const later = ISLAND_ORDER.filter((i) => toCome(game, i)).map((i) => ISLANDS[i].name.toLowerCase())
  return (
    <div className="board" data-testid="restorations">
      <p className="board__intro">
        Old places worth mending. Bring things over whenever you have them: anything brought stays brought, and nothing here is in a hurry.
      </p>
      {open.map((island) => (
        <IslandBoard key={island} island={island} game={game} />
      ))}
      {later.length > 0 && (
        <p className="hint" data-testid="restorations-later">
          <Icon name="island" size={14} /> The {later.join(', ').replace(/, ([^,]*)$/, ' and $1')} {later.length > 1 ? 'have lists of their own, once they are' : 'has a list of its own, once it is'} yours.
        </p>
      )}
    </div>
  )
}
