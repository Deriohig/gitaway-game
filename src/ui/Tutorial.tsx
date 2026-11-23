import { useState } from 'react'
import { TASKS } from '../game/config'
import { useGame } from '../store/game'
import { Icon } from './Icon'

const STEPS = [
  {
    anchor: 'center',
    title: 'An island to look after',
    body: 'It grows from your real work. Nothing withers if you take a break, a weekend, or a fortnight in the sun.',
  },
  {
    anchor: 'session',
    title: 'Clock in when you start working',
    body: `Coins and wood trickle in while a session runs. End it to collect. Finished a task? Log it for ${TASKS.coins} coins and ${TASKS.wood} wood.`,
  },
  {
    anchor: 'garden',
    title: 'Grow something',
    body: 'Plant seeds in the garden, or click a plot on the island. Crops keep growing while Gitaway is closed.',
  },
  {
    anchor: 'shop',
    title: 'Make it home',
    body:
      'Spend coins on flowers, animals and new islands, and build a woodshed for wood of your own. ' +
      'What the farm makes waits for you to collect. Watch the place come to life, one commit at a time.',
  },
] as const

export function Tutorial() {
  const setSettings = useGame((s) => s.setSettings)
  const farmOnly = useGame((s) => s.game.settings.farmOnly)
  const [step, setStep] = useState(0)
  const steps = farmOnly ? STEPS.filter((t) => t.anchor !== 'session') : STEPS
  const s = steps[step]
  const last = step === steps.length - 1
  const done = () => setSettings({ tutorialDone: true })

  return (
    <div className={`tour tour--${s.anchor}`} role="dialog" aria-labelledby="tour-title" aria-describedby="tour-body" data-testid="tutorial">
      <div className="card tour__card">
        <div className="tour__count">
          {step + 1} / {steps.length}
        </div>
        <h2 id="tour-title">{s.title}</h2>
        <p id="tour-body">{s.body}</p>
        <div className="tour__actions">
          <button className="link" onClick={done} data-testid="tutorial-skip">
            Skip tour
          </button>
          <span className="btn-group">
            {step > 0 && (
              <button className="btn btn--small" onClick={() => setStep(step - 1)}>
                Back
              </button>
            )}
            <button className="btn btn--small btn--primary" onClick={() => (last ? done() : setStep(step + 1))} autoFocus data-testid="tutorial-next">
              {last ? "Let's go" : 'Next'}
              {!last && <Icon name="chevronDown" size={14} className="rot-270" />}
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
