import { useEffect, useRef } from 'react'
import type { JournalEntry } from '../game/state'
import { useGame } from '../store/game'
import { Icon } from './Icon'
import { KIND_ICON } from './panels/journal/JournalTab'

/** Lines on the card before "and N more in the journal". */
const SHOWN = 6

/**
 * The welcome-back card (A1): what happened on the island since the player
 * was last here, and their note for next time. It never says how long they
 * were away, and it never asks for anything.
 */
export function Recap() {
  const recap = useGame((s) => s.recap)
  if (!recap?.length) return null
  return <RecapCard recap={recap} />
}

function RecapCard({ recap }: { recap: JournalEntry[] }) {
  const farmName = useGame((s) => s.game.farmName)
  const nextNote = useGame((s) => s.game.nextNote)
  const dismiss = useGame((s) => s.dismissRecap)
  const open = useGame((s) => s.openPanel)
  const card = useRef<HTMLElement>(null)

  // The card itself takes focus, not one of its buttons, so keys meant for
  // whatever the player was typing in press nothing. Focus goes back there
  // when it's put away, unless the player has moved it on meanwhile.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const el = card.current
    el?.focus({ preventScroll: true })
    return () => {
      const now = document.activeElement
      if (!now || now === document.body || el?.contains(now)) previous?.focus({ preventScroll: true })
    }
  }, [])

  const more = recap.length - SHOWN
  return (
    <section
      ref={card}
      className="card recap"
      role="dialog"
      tabIndex={-1}
      aria-labelledby="recap-title"
      aria-describedby="recap-lines"
      data-testid="recap"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          dismiss()
        }
      }}
    >
      <header className="recap__head">
        <span className="recap__badge" aria-hidden="true">
          <Icon name="island" size={30} />
        </span>
        <div>
          <div className="eyebrow recap__farm">{farmName}</div>
          <h2 id="recap-title" className="recap__title">
            On the island
          </h2>
        </div>
      </header>
      {nextNote && (
        <p className="recap__note" data-testid="recap-note">
          <Icon name="journal" size={16} />
          <span>
            <span className="recap__note-label">Last time you noted:</span> {nextNote}
          </span>
        </p>
      )}
      <ul className="recap__lines" id="recap-lines">
        {recap.slice(0, SHOWN).map((e) => (
          <li key={e.id} className={`recap__line recap__line--${e.kind}`} data-testid="recap-line">
            <span className="recap__icon" aria-hidden="true">
              <Icon name={KIND_ICON[e.kind]} size={15} />
            </span>
            <span className="recap__text">{e.title}</span>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <p className="recap__more" data-testid="recap-more">
          and {more} more in the journal
        </p>
      )}
      <div className="btn-row recap__actions">
        <button
          className="btn btn--small"
          onClick={() => {
            dismiss()
            open('journal')
          }}
          data-testid="recap-open-journal"
        >
          Open journal
        </button>
        <button className="btn btn--small btn--primary" onClick={dismiss} data-testid="recap-dismiss">
          Lovely
        </button>
      </div>
    </section>
  )
}
