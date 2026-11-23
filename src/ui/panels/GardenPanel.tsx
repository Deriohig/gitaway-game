import { BONUS, CROPS, CROP_IDS, PLOTS, type CropId } from '../../game/config'
import { YIELD_IDS } from '../../game/content/yields'
import { cropProgress, harvest, harvestAll, harvestValue, isCropUnlocked, isFresh, isReady, plant, plantAll } from '../../game/engine'
import type { Plot } from '../../game/state'
import { collectAll, waitingYields } from '../../game/systems/yields'
import { useCoarseNow } from '../../hooks/useCoarseNow'
import { useGame } from '../../store/game'
import { PLOT_SLOTS } from '../../world/layout'
import { CropArt } from '../Art'
import { ItemCard } from '../ItemCard'
import { duration } from '../format'
import { Icon } from '../Icon'
import { Panel, Section } from '../Panel'

/** The fresh-soil bonus, as the garden shows it. */
const FRESH = `+${Math.round(BONUS.freshSoil * 100)}%`

/** What the plot's soil pays extra for. */
const freshSoilHint = (plot: Plot) =>
  plot.lastCrop ? `Fresh soil: ${FRESH} for anything but ${CROPS[plot.lastCrop].plural.toLowerCase()}` : `Fresh soil: ${FRESH} for any crop`

function SeedPicker({
  onPick,
  allLabel,
  fresh,
}: {
  onPick: (crop: CropId) => void
  allLabel?: (crop: CropId) => string
  /** Whether the crop would grow in fresh soil where it's sown. */
  fresh: (crop: CropId) => boolean
}) {
  const game = useGame((s) => s.game)
  const open = useGame((s) => s.openPanel)
  const available = CROP_IDS.filter((c) => isCropUnlocked(game, c) && game.seeds[c] > 0)
  if (!available.length) {
    return (
      <div className="empty">
        <p>No seeds in the shed.</p>
        <button className="btn btn--small" onClick={() => open('shop')}>
          <Icon name="shop" size={18} /> Buy seeds
        </button>
      </div>
    )
  }
  return (
    <ul className="seed-list">
      {available.map((c) => (
        <li key={c}>
          <button className="seed" onClick={() => onPick(c)} data-testid={`plant-${c}`}>
            <CropArt crop={c} size={28} />
            <span className="seed__name">
              <strong>{allLabel ? allLabel(c) : CROPS[c].name}</strong>
              <span className="muted small">
                {duration(CROPS[c].growMinutes * 60_000)} · ×{game.seeds[c]}
                {fresh(c) && ` · ${FRESH}`}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function GardenPanel() {
  const game = useGame((s) => s.game)
  const selected = useGame((s) => s.selectedPlot)
  const select = useGame((s) => s.selectPlot)
  const run = useGame((s) => s.run)
  const now = useCoarseNow(1000)

  const plot = game.plots.find((p) => p.id === selected) ?? null
  const ready = game.plots.filter((p) => isReady(p, now))
  const empty = game.plots.filter((p) => !p.crop)
  const waiting = waitingYields(game, now)
  const collectable = YIELD_IDS.some((id) => waiting[id] > 0)

  const cells = PLOT_SLOTS.map((slot, i) => ({ slot, plot: game.plots[i] ?? null }))

  return (
    <Panel title="Garden" icon="garden" testId="panel-garden">
      <div className="garden-actions">
        <div className="garden-actions__buttons">
          <button className="btn btn--primary btn--small" disabled={!ready.length} onClick={() => run(harvestAll)} data-testid="harvest-all">
            <Icon name="basket" size={18} /> Harvest all{ready.length ? ` (${ready.length})` : ''}
          </button>
          {/* What the animals, hives, trees, woodshed and water have made. */}
          <button className="btn btn--primary btn--small" disabled={!collectable} onClick={() => run(collectAll)} data-testid="collect-all">
            <Icon name="farm" size={18} /> Collect all
          </button>
        </div>
        <span className="muted small">
          {game.plots.length} of {PLOTS.max} plots
        </span>
      </div>

      <div className="plot-grid" role="grid" aria-label="Garden plots">
        {cells.map(({ slot: [col, row], plot: p }, i) => {
          const style = { gridColumn: col + 1, gridRow: row + 1 }
          if (!p) return <div key={`locked-${i}`} className="plot plot--locked" style={style} aria-hidden="true" />
          const isSel = p.id === selected
          const r = isReady(p, now)
          const label = p.crop
            ? `Plot ${i + 1}: ${CROPS[p.crop].name}, ${r ? 'ready to harvest' : `${Math.round(cropProgress(p, now) * 100)}% grown`}`
            : `Plot ${i + 1}: empty`
          return (
            <button
              key={p.id}
              role="gridcell"
              style={style}
              className={`plot ${p.crop ? 'plot--planted' : ''} ${r ? 'plot--ready' : ''} ${isSel ? 'is-selected' : ''}`}
              onClick={() => (r ? run((s, t) => harvest(s, p.id, t)) : select(isSel ? null : p.id))}
              aria-label={label}
              aria-selected={isSel}
              data-testid={`plot-${i}`}
            >
              {p.crop ? <CropArt crop={p.crop} size={26} /> : <span className="plot__furrow" />}
              {p.crop && !r && (
                <span className="plot__progress" style={{ width: `${Math.round(cropProgress(p, now) * 100)}%` }} />
              )}
            </button>
          )
        })}
      </div>

      {plot && (
        <Section title={`Plot ${game.plots.indexOf(plot) + 1}`}>
          {!plot.crop && (
            <>
              <p className="muted small">Choose what to sow.</p>
              <p className="muted small">{freshSoilHint(plot)}</p>
              <SeedPicker onPick={(c) => run((s, t) => plant(s, plot.id, c, t))} fresh={(c) => isFresh(plot, c)} />
            </>
          )}
          {plot.crop && !isReady(plot, now) && (
            <div className="plot-detail">
              <CropArt crop={plot.crop} size={40} />
              <div>
                <strong>{CROPS[plot.crop].name}</strong>
                <div className="muted small">
                  Ready in {duration(plot.readyAt! - now)} · worth {harvestValue(game, plot.crop, isFresh(plot, plot.crop))} coins
                </div>
                <div className="bar">
                  <span style={{ width: `${Math.round(cropProgress(plot, now) * 100)}%` }} />
                </div>
              </div>
            </div>
          )}
          {plot.crop && isReady(plot, now) && (
            <button className="btn btn--primary" onClick={() => run((s, t) => harvest(s, plot.id, t))} data-testid="harvest-selected">
              Harvest {CROPS[plot.crop].name.toLowerCase()}
            </button>
          )}
        </Section>
      )}

      {!plot && empty.length > 0 && (
        <Section title="Sow every empty plot">
          <p className="muted small">Or pick a single plot above, or click one on the island.</p>
          {/* The bonus shows only where every empty plot would earn it. */}
          <SeedPicker onPick={(c) => run((s, t) => plantAll(s, c, t))} fresh={(c) => empty.every((p) => isFresh(p, c))} />
        </Section>
      )}

      {game.plots.length < PLOTS.max && (
        <Section title="More room">
          <ul className="items">
            <ItemCard id="plot" />
          </ul>
        </Section>
      )}
      <p className="hint">Crops keep growing while Gitaway is closed, and wait patiently once they are ready.</p>
    </Panel>
  )
}
