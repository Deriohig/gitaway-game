import { useState } from 'react'
import { clockOffset, now, skipAhead } from '../game/clock'
import { DEV_GRANTS, DEV_SKIPS, formatOffset, grantResources, levelUp, xpToNext } from '../game/dev'
import { levelForXp } from '../game/progression'
import { useGame } from '../store/game'
import { num } from '../ui/format'
import './dev.css'

// Development and dev-tools builds only: App.tsx loads this behind
// `__DEV_TOOLS__`, so ordinary production builds leave it (and src/game/dev.ts)
// out entirely. Grants and skips go through the pure helpers in
// src/game/dev.ts and the game clock.

const timeFormat: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }

export default function DevPanel() {
  const [open, setOpen] = useState(false)
  const run = useGame((s) => s.run)
  const xp = useGame((s) => s.game.xp)
  // The store's time moves on every second, so the read-out does too.
  useGame((s) => s.now)

  return (
    <div className="dev">
      {open && (
        <section className="card dev__panel" aria-label="Developer tools" data-testid="dev-panel">
          <header className="dev__head">
            <strong>Dev tools</strong>
            <span className="dev__note">development builds only</span>
          </header>
          <div className="dev__row">
            <span className="dev__label">Coins</span>
            {DEV_GRANTS.coins.map((n) => (
              <button key={n} className="btn btn--small" onClick={() => run((s) => grantResources(s, { coins: n }))} data-testid={`dev-coins-${n}`}>
                +{num(n)}
              </button>
            ))}
          </div>
          <div className="dev__row">
            <span className="dev__label">Wood</span>
            {DEV_GRANTS.wood.map((n) => (
              <button key={n} className="btn btn--small" onClick={() => run((s) => grantResources(s, { wood: n }))} data-testid={`dev-wood-${n}`}>
                +{num(n)}
              </button>
            ))}
          </div>
          <div className="dev__row">
            <span className="dev__label">Level</span>
            <button className="btn btn--small" onClick={() => run(levelUp)} data-testid="dev-level">
              XP to level {levelForXp(xp) + 1}
            </button>
            <span className="dev__note">{num(xpToNext(xp))} XP</span>
          </div>
          <div className="dev__row">
            <span className="dev__label">Time</span>
            {DEV_SKIPS.map((s) => (
              // The store catches up straight away, as after a real absence: crops, visitors, the recap.
              <button key={s.ms} className="btn btn--small" onClick={() => skipAhead(s.ms)} data-testid={`dev-skip-${s.ms}`}>
                {s.label}
              </button>
            ))}
          </div>
          <dl className="dev__clock" data-testid="dev-clock">
            <dt>Game time</dt>
            <dd>{new Date(now()).toLocaleString('en-GB', timeFormat)}</dd>
            <dt>Offset</dt>
            <dd>{formatOffset(clockOffset())}</dd>
          </dl>
        </section>
      )}
      <button
        className={`dev__toggle ${open ? 'is-active' : ''}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={open ? 'Close the dev tools' : 'Open the dev tools'}
        title="Dev tools (development builds only)"
        data-testid="dev-open"
      >
        Dev
      </button>
    </div>
  )
}
