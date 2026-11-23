import { useState } from 'react'
import { renameFarm, updateSettings } from '../game/engine'
import { useGame } from '../store/game'
import { Icon } from './Icon'
import { Logo } from './Logo'

export function Welcome() {
  const name = useGame((s) => s.game.farmName)
  const run = useGame((s) => s.run)
  const [draft, setDraft] = useState(name)

  const begin = () => {
    run((s) => {
      const renamed = renameFarm(s, draft)
      return updateSettings(renamed.ok ? renamed.state : s, { welcomed: true })
    })
  }

  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title" data-testid="welcome">
      <div className="card welcome__card">
        <p className="welcome__memory">You remember a long day, a bright screen, and then nothing.</p>
        <Logo size={76} />
        <h1 id="welcome-title" className="welcome__title">
          Gitaway
        </h1>
        <p className="welcome__tagline">Commit code. Escape to the countryside.</p>
        <p className="welcome__pitch">
          A little island that grows while you work. Clock in, earn coins, plant a garden, and slowly build the farm you keep
          promising to retire to.
        </p>
        <form
          className="welcome__form"
          onSubmit={(e) => {
            e.preventDefault()
            begin()
          }}
        >
          <label htmlFor="farm-name">Name your farm</label>
          <div className="welcome__row">
            <input id="farm-name" value={draft} maxLength={32} onChange={(e) => setDraft(e.target.value)} autoFocus data-testid="welcome-name" />
            <button className="btn btn--primary" type="submit" data-testid="welcome-begin">
              Begin
            </button>
          </div>
        </form>
        <p className="welcome__privacy">
          <Icon name="shield" size={16} /> No account needed. Your farm lives in this browser and nothing leaves your device.
        </p>
      </div>
    </div>
  )
}
