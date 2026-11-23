import { Fragment, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { CROPS, SESSION, TASKS, UNLOCKS } from '../game/config'
import { YIELD_IDS, yieldAmount, type YieldId } from '../game/content/yields'
import { cropProgress, endSession, harvestAll, isReady, renameFarm, startSession } from '../game/engine'
import { isOn } from '../game/features'
import { levelForXp, levelProgress } from '../game/progression'
import type { GameState, Plot } from '../game/state'
import { collectAll, waitingYields } from '../game/systems/yields'
import { useCoarseNow } from '../hooks/useCoarseNow'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useGame } from '../store/game'
import { CropArt } from './Art'
import { clock, duration, num } from './format'
import { Icon } from './Icon'
import { Logo } from './Logo'
import { toolbarTools } from './surfaces'

export function FarmBadge() {
  const name = useGame((s) => s.game.farmName)
  const xp = useGame((s) => s.game.xp)
  const run = useGame((s) => s.run)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const input = useRef<HTMLInputElement>(null)
  const p = levelProgress(xp)

  useEffect(() => {
    if (editing) input.current?.select()
  }, [editing])

  const save = () => {
    run((s) => renameFarm(s, draft))
    setEditing(false)
  }

  return (
    <section className="card farm-badge" aria-label="Farm">
      <Logo size={44} className="farm-badge__logo" />
      <div className="farm-badge__body">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <input
              ref={input}
              className="farm-badge__input"
              value={draft}
              maxLength={32}
              aria-label="Farm name"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setDraft(name)
                  setEditing(false)
                }
              }}
            />
          </form>
        ) : (
          <button
            className="farm-badge__name"
            onClick={() => {
              setDraft(name)
              setEditing(true)
            }}
            aria-label={`${name}. Rename farm`}
            data-testid="farm-name"
          >
            <span>{name}</span>
            <Icon name="edit" size={14} />
          </button>
        )}
        <div className="farm-badge__level">
          <span data-testid="farm-level">Level {p.level}</span> · {p.title}
        </div>
        <div className="xp" title={`${p.into} of ${p.span} XP to level ${p.level + 1}`}>
          <div
            className="bar"
            role="progressbar"
            aria-label="Experience"
            aria-valuemin={0}
            aria-valuemax={p.span}
            aria-valuenow={p.into}
          >
            <span style={{ width: `${Math.round(p.fraction * 100)}%` }} />
          </div>
          <span className="xp__text">
            {num(p.into)} / {num(p.span)} XP
          </span>
        </div>
      </div>
    </section>
  )
}

const WOOD_TITLE =
  `Wood: a piece for every ${SESSION.minutesPerWood} minutes of focus and ${TASKS.wood} for each task you log. ` +
  'The woodshed stacks more on its own.'

export function Resources() {
  const coins = useGame((s) => s.game.coins)
  const wood = useGame((s) => s.game.wood)
  const seeds = useGame((s) => Object.values(s.game.seeds).reduce((a, b) => a + b, 0))
  const panel = useGame((s) => s.panel)
  const toggle = useGame((s) => s.togglePanel)
  return (
    <div className="resources">
      <div className="card chips" aria-label="Resources">
        <span className="chip" title="Coins: earned from work sessions, tasks and harvests" data-testid="coins">
          <Icon name="coin" size={22} />
          <strong>{num(coins)}</strong>
          <span className="sr-only">coins</span>
        </span>
        <span className="chip" title="Seed packets" data-testid="seeds">
          <Icon name="seed" size={22} />
          <strong>{num(seeds)}</strong>
          <span className="sr-only">seed packets</span>
        </span>
        <span className="chip" title={WOOD_TITLE} data-testid="wood">
          <Icon name="wood" size={22} />
          <strong>{num(wood)}</strong>
          <span className="sr-only">wood</span>
        </span>
      </div>
      <button
        className={`card icon-btn ${panel === 'settings' ? 'is-active' : ''}`}
        onClick={() => toggle('settings')}
        aria-label="Settings and privacy"
        aria-pressed={panel === 'settings'}
        data-testid="open-settings"
      >
        <Icon name="gear" size={22} />
      </button>
    </div>
  )
}

/**
 * Whether every tool's label fits in its button. How many tools there are
 * depends on the feature switches, so this is measured, not guessed from the
 * screen width; it's checked again when the bar resizes or the font arrives.
 */
function useLabelsFit(bar: RefObject<HTMLElement | null>, count: number): boolean {
  const [fit, setFit] = useState(true)
  useLayoutEffect(() => {
    const el = bar.current
    if (!el) return
    const check = () => {
      const tools = [...el.querySelectorAll<HTMLElement>('.tool')]
      const roomy = tools.every((tool) => {
        const label = tool.querySelector<HTMLElement>('.tool__label')
        const style = getComputedStyle(tool)
        const room = tool.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
        return !label || label.scrollWidth <= room + 0.5
      })
      // A label too long for an equal share widens its button and pushes the bar over the edge.
      setFit(roomy && el.scrollWidth <= el.clientWidth)
    }
    check()
    const observer = new ResizeObserver(check)
    observer.observe(el)
    void document.fonts?.ready.then(check)
    return () => observer.disconnect()
  }, [bar, count])
  return fit
}

/** The kinds of output with at least one whole unit waiting to be collected, in order. */
const waitingKinds = (game: GameState, now: number): [YieldId, number][] => {
  const waiting = waitingYields(game, now)
  return YIELD_IDS.filter((id) => waiting[id] > 0).map((id) => [id, waiting[id]])
}

/** The garden's badge: ripe plots, and each kind of output waiting to be collected. */
function useGardenBadge(): number {
  const game = useGame((s) => s.game)
  const now = useCoarseNow(5000)
  return game.plots.filter((p) => isReady(p, now)).length + waitingKinds(game, now).length
}

/** The number keys open the tools and Esc closes a panel, from the toolbar or the compact bar. */
function useToolKeys() {
  const toggle = useGame((s) => s.togglePanel)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest('input, textarea, select, [contenteditable]')) return
      const tool = toolbarTools().find((t) => t.key === e.key)
      if (tool) toggle(tool.id)
      if (e.key === 'Escape') useGame.getState().openPanel(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])
}

export function Toolbar() {
  const panel = useGame((s) => s.panel)
  const toggle = useGame((s) => s.togglePanel)
  const islandResting = useGame((s) => levelForXp(s.game.xp) < UNLOCKS.island)
  const readyCount = useGardenBadge()
  // Only the tools of switched-on features, numbered in order (see surfaces.ts).
  const tools = toolbarTools()
  const bar = useRef<HTMLElement>(null)
  const labelsFit = useLabelsFit(bar, tools.length)
  useToolKeys()

  return (
    <nav ref={bar} className="card toolbar" aria-label="Farm tools" data-labels={labelsFit ? 'shown' : 'hidden'}>
      {tools.map((t) => (
        <button
          key={t.id}
          className={`tool ${panel === t.id ? 'is-active' : ''} ${t.id === 'island' && islandResting ? 'tool--resting' : ''}`}
          title={t.id === 'island' && islandResting ? `Opens at level ${UNLOCKS.island}` : undefined}
          onClick={() => toggle(t.id)}
          aria-pressed={panel === t.id}
          aria-keyshortcuts={t.key}
          data-testid={`tool-${t.id}`}
          data-tour={t.id}
        >
          <Icon name={t.icon} size={28} />
          {/* Where the labels don't fit, they're hidden visually but still name the buttons. */}
          <span className="tool__label">{t.label}</span>
          {t.id === 'garden' && readyCount > 0 && (
            <span className="tool__badge" aria-label={`${readyCount} ready`}>
              {readyCount}
            </span>
          )}
        </button>
      ))}
    </nav>
  )
}

/**
 * When the HUD folds into the compact bar (A6): a window shorter than 420
 * pixels (a strip, a phone on its side), or under 560 wide and not tall (a
 * corner of the screen). A phone held upright keeps the whole HUD. Ranges,
 * so a window 419.5 pixels tall (zoomed, say) counts as under 420.
 */
export const COMPACT_QUERY = '(height < 420px), (width < 560px) and (height < 560px)'

/** Whether the HUD is folded into the compact bar. Never while the Attention switch is off. */
export function useCompactHud(): boolean {
  return useMediaQuery(isOn('attention') ? COMPACT_QUERY : 'not all')
}

/**
 * The whole HUD in one bar, for small windows (A6): coins, the work session's
 * timer with its start and stop button, the Garden and the Journal, and
 * Settings, which holds the window's layout. Panels open over the island
 * below it, and the number keys still open every tool.
 */
export function CompactBar() {
  const coins = useGame((s) => s.game.coins)
  const session = useGame((s) => s.game.session)
  const farmOnly = useGame((s) => s.game.settings.farmOnly)
  const now = useGame((s) => s.now)
  const panel = useGame((s) => s.panel)
  const toggle = useGame((s) => s.togglePanel)
  const run = useGame((s) => s.run)
  const readyCount = useGardenBadge()
  useToolKeys()
  const elapsed = session ? Math.max(0, now - session.startedAt) : 0
  const tools = toolbarTools().filter((t) => t.id === 'garden' || t.id === 'journal')
  const toggleSession = () => run(session ? endSession : startSession)
  return (
    <nav className="card compact-bar" aria-label="Farm and work session" data-testid="compact-hud">
      <span className="chip compact-bar__coins" title="Coins: earned from work sessions, tasks and harvests" data-testid="coins">
        <Icon name="coin" size={20} />
        <strong>{num(coins)}</strong>
        <span className="sr-only">coins</span>
      </span>
      {(!farmOnly || session) && (
        <span className="compact-bar__session">
          <span className={`dot ${session ? 'dot--on' : ''}`} />
          <span className="compact-bar__timer" title={session ? 'Clocked in' : 'Not working'} data-testid="session-timer">
            {clock(elapsed)}
          </span>
          <button
            className={`icon-btn compact-bar__btn ${session ? 'compact-bar__stop' : 'compact-bar__start'}`}
            onClick={toggleSession}
            aria-label={session ? 'End session' : 'Start work session'}
            title={session ? 'End session' : 'Start work session'}
            data-testid={session ? 'end-session' : 'start-session'}
          >
            <Icon name={session ? 'stop' : 'play'} size={18} />
          </button>
        </span>
      )}
      <span className="compact-bar__tools">
        {tools.map((t) => (
          <button
            key={t.id}
            className={`icon-btn compact-bar__btn ${panel === t.id ? 'is-active' : ''}`}
            onClick={() => toggle(t.id)}
            aria-label={t.label}
            aria-pressed={panel === t.id}
            aria-keyshortcuts={t.key}
            title={t.label}
            data-testid={`tool-${t.id}`}
          >
            <Icon name={t.icon} size={22} />
            {t.id === 'garden' && readyCount > 0 && (
              <span className="tool__badge compact-bar__badge" aria-label={`${readyCount} ready`}>
                {readyCount}
              </span>
            )}
          </button>
        ))}
        <button
          className={`icon-btn compact-bar__btn ${panel === 'settings' ? 'is-active' : ''}`}
          onClick={() => toggle('settings')}
          aria-label="Settings and privacy"
          aria-pressed={panel === 'settings'}
          title="Settings"
          data-testid="open-settings"
        >
          <Icon name="gear" size={20} />
        </button>
      </span>
    </nav>
  )
}

/**
 * A small card for what the farm has made, waiting to be collected, and for
 * the next crop to ripen or the ones ready now. While the garden panel is open
 * it shows only what's waiting: the panel shows the crops itself.
 */
export function NextCrop() {
  const game = useGame((s) => s.game)
  const run = useGame((s) => s.run)
  const panel = useGame((s) => s.panel)
  const now = useCoarseNow(1000)
  const waiting = waitingKinds(game, now)

  const collect = waiting.length > 0 && (
    <div className="next-crop__collect">
      <div className="next-crop__row">
        <Icon name="farm" size={28} />
        <div>
          <div className="eyebrow">Ready to collect</div>
          <strong>
            {waiting.map(([id, n], i) => (
              <Fragment key={id}>
                {i > 0 && ' · '}
                <span className="next-crop__amount">{yieldAmount(id, n)}</span>
              </Fragment>
            ))}
          </strong>
        </div>
      </div>
      <button className="btn btn--primary btn--small" onClick={() => run(collectAll)} data-testid="collect-all-quick">
        Collect all
      </button>
    </div>
  )
  const crops = panel === 'garden' ? null : <CropNews plots={game.plots} now={now} />
  if (!collect && !crops) return null
  return (
    <section className="card next-crop" aria-label="Garden">
      {collect}
      {crops}
    </section>
  )
}

/** The crops' part of the bottom-left card: the ones ready to harvest, the next to ripen, or resting soil. */
function CropNews({ plots, now }: { plots: Plot[]; now: number }) {
  const run = useGame((s) => s.run)
  const open = useGame((s) => s.openPanel)
  const ready = plots.filter((p) => isReady(p, now))
  const growing = plots.filter((p) => p.crop && !isReady(p, now)).sort((a, b) => a.readyAt! - b.readyAt!)

  if (ready.length) {
    return (
      <>
        <div className="next-crop__row">
          <CropArt crop={ready[0].crop!} size={30} />
          <div>
            <div className="eyebrow">Ready to harvest</div>
            <strong>
              {ready.length === 1 ? CROPS[ready[0].crop!].name : `${ready.length} crops`}
            </strong>
          </div>
        </div>
        <button className="btn btn--primary btn--small" onClick={() => run(harvestAll)} data-testid="harvest-all-quick">
          Harvest {ready.length > 1 ? 'all' : ''}
        </button>
      </>
    )
  }
  if (growing.length) {
    const next = growing[0]
    const p = cropProgress(next, now)
    return (
      <button className="next-crop__open" onClick={() => open('garden')} aria-label="Open the garden">
        <div className="next-crop__row">
          <CropArt crop={next.crop!} size={30} />
          <div>
            <div className="eyebrow">Next crop</div>
            <strong>{CROPS[next.crop!].name}</strong>
            <span className="muted"> · {duration(next.readyAt! - now)}</span>
          </div>
        </div>
        <div className="bar bar--thin" aria-hidden="true">
          <span style={{ width: `${Math.round(p * 100)}%` }} />
        </div>
      </button>
    )
  }
  return (
    <button className="next-crop__open" onClick={() => open('garden')} aria-label="Open the garden">
      <div className="next-crop__row">
        <Icon name="garden" size={28} />
        <div>
          <div className="eyebrow">Garden</div>
          <strong>Resting soil</strong>
          <div className="muted small">Plant something?</div>
        </div>
      </div>
    </button>
  )
}
