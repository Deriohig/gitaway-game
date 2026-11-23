import { useEffect, useMemo, useRef, useState } from 'react'
import { LETTERS, LETTER_SENDERS, type LetterId } from '../../../game/content/letters'
import { localDateKey, type Letter } from '../../../game/state'
import { letterParts, lettersForTab, readLetter } from '../../../game/systems/mail'
import { useGame } from '../../../store/game'
import { letterDay, noonOf } from './days'

/**
 * Journal → Letters (B4): letters from the island's characters, unread first, then newest, each kept and readable
 * forever. An unread one carries a seal, never a number.
 */
export function LettersTab() {
  const letters = useGame((s) => s.game.mail.letters)
  const run = useGame((s) => s.run)
  const [open, setOpen] = useState<LetterId | null>(null)
  /** The letter just put down, whose row takes focus back. */
  const closed = useRef<LetterId | null>(null)

  const read = (id: LetterId) => {
    // Refused, and nothing changes, for a letter that is read already.
    run((s) => readLetter(s, id))
    setOpen(id)
  }
  const back = () => {
    closed.current = open
    setOpen(null)
  }

  if (open !== null) return <LetterView id={open} onBack={back} />
  return <LetterList letters={letters} onOpen={read} focusOn={closed} />
}

function LetterList({ letters, onOpen, focusOn }: { letters: Letter[]; onOpen: (id: LetterId) => void; focusOn: { current: LetterId | null } }) {
  const list = useMemo(() => lettersForTab(letters), [letters])
  // "Today" and "Yesterday" change at midnight, not with every tick: follow the date, not the clock.
  const today = useGame((s) => localDateKey(s.now))
  const labelAt = noonOf(today)
  const root = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const id = focusOn.current
    if (id === null) return
    focusOn.current = null
    root.current?.querySelector<HTMLElement>(`[data-letter="${id}"]`)?.focus()
  }, [focusOn])

  return (
    <ul className="letters" ref={root} data-testid="letters">
      {list.map((l) => {
        const def = LETTERS[l.id]
        const from = LETTER_SENDERS[def.from].name
        const when = letterDay(l.at, labelAt)
        return (
          <li key={l.id}>
            <button
              className={`letter-row ${l.read ? '' : 'letter-row--unread'}`}
              onClick={() => onOpen(l.id)}
              aria-label={`${l.read ? '' : 'Unread: '}${from}, ${def.title} ${when}`}
              data-testid="letter"
              data-letter={l.id}
              data-read={l.read}
            >
              {!l.read && <span className="letter-row__seal" aria-hidden="true" />}
              <span className="letter-row__text">
                <span className="letter-row__from">{from}</span>
                <span className="letter-row__title">{def.title}</span>
              </span>
              <time className="letter-row__when" dateTime={new Date(l.at).toISOString()}>
                {when}
              </time>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** One letter, laid out as drafted: the salutation, the bold title, each line on its own, and the sign-off. */
function LetterView({ id, onBack }: { id: LetterId; onBack: () => void }) {
  const farmName = useGame((s) => s.game.farmName)
  const heading = useRef<HTMLHeadingElement>(null)
  const { salutation, title, lines, signOff } = letterParts(LETTERS[id], farmName)

  useEffect(() => {
    heading.current?.focus()
  }, [id])

  return (
    <article className="letter" data-testid="letter-view" data-letter={id} aria-labelledby="letter-title">
      <button className="letter__back" onClick={onBack} data-testid="letter-back">
        <span aria-hidden="true">‹</span> All letters
      </button>
      <div className="letter__paper">
        <p className="letter__salutation">{salutation}</p>
        <h3 id="letter-title" className="letter__title" ref={heading} tabIndex={-1} data-testid="letter-title">
          {title}
        </h3>
        {lines.map((line, i) => (
          <p key={i} className="letter__line">
            {line}
          </p>
        ))}
        <p className="letter__sign-off">{signOff}</p>
      </div>
    </article>
  )
}
