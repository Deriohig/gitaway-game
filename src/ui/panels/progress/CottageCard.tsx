import { xpForLevel } from '../../../game/progression'
import { useGame } from '../../../store/game'
import { Section } from '../../Panel'

const RETIREMENT_LEVEL = 10

/** The card's caption: how far along the way to becoming an Islander, as a share from 0 to 1. */
export function retirementCaption(share: number): string {
  return share >= 1 ? "You're an Islander." : `${Math.round(share * 100)}% of the way to becoming an Islander.`
}

/**
 * Progress → the retirement card. Today it's the plan's progress bar; the
 * retirement cottage (C3) replaces it with the cottage's stage, a picture and
 * a bar to the next stage.
 */
export function CottageCard() {
  const xp = useGame((s) => s.game.xp)
  const retirement = Math.min(1, xp / xpForLevel(RETIREMENT_LEVEL))
  return (
    <Section title="Retirement plan">
      <div className="bar bar--gold" role="progressbar" aria-label="Progress to Islander" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(retirement * 100)}>
        <span style={{ width: `${Math.round(retirement * 100)}%` }} />
      </div>
      <p className="muted small">{retirementCaption(retirement)}</p>
    </Section>
  )
}
