import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { JOURNAL_KINDS, localDateKey, type JournalEntry, type JournalKind } from '../../../game/state'
import { JOURNAL, setEntryNote, shownLines } from '../../../game/systems/journal'
import { useGame } from '../../../store/game'
import { Icon } from '../../Icon'
import { byDay, dayLabel, noonOf } from './days'

/** Lines shown at once, newest first; "Show older" brings the next page. */
const PAGE = 50

/** What each kind of line is called on the filter chips. */
export const KIND_LABEL: Record<JournalKind, string> = {
  work: 'Work',
  garden: 'Garden',
  build: 'Building',
  level: 'Levels',
  visitor: 'Visitors',
  letter: 'Letters',
  restoration: 'Restorations',
  stamp: 'Stamps',
  story: 'Story',
  git: 'Repositories',
  craft: 'Making',
  fish: 'Fishing',
  cottage: 'Cottage',
  character: 'Characters',
}

/** The small picture beside each kind of line, here and on the recap card. */
export const KIND_ICON: Record<JournalKind, string> = {
  work: 'task',
  garden: 'sprout',
  build: 'hammer',
  level: 'star',
  visitor: 'bird',
  letter: 'letter',
  restoration: 'island',
  stamp: 'stamp',
  story: 'journal',
  git: 'branch',
  craft: 'pot',
  fish: 'fish',
  cottage: 'farm',
  character: 'sparkle',
}

const time = (at: number) => new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

/** One line of the journal, with the player's own note, editable in place. */
function EntryLine({ entry }: { entry: JournalEntry }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const finished = useRef(false)
  const editButton = useRef<HTMLButtonElement>(null)

  const start = () => {
    finished.current = false
    setDraft(entry.note ?? '')
    setEditing(true)
  }
  /** Saves (Enter, blur) or cancels (Escape). Keyboard endings hand focus back to the note's button. */
  const finish = (save: boolean, refocus: boolean) => {
    if (finished.current) return
    finished.current = true
    if (save) useGame.getState().run((s) => setEntryNote(s, entry.id, draft))
    setEditing(false)
    if (refocus) requestAnimationFrame(() => editButton.current?.focus())
  }

  return (
    // Focusable from code only: "Show older" hands focus to the first line it brings in.
    <li className={`journal__entry journal__entry--${entry.kind}`} tabIndex={-1} data-testid="journal-entry" data-kind={entry.kind}>
      <span className="journal__icon" aria-hidden="true">
        <Icon name={KIND_ICON[entry.kind]} size={16} />
      </span>
      <div className="journal__text">
        <strong>{entry.title}</strong>
        {entry.detail && <span>{entry.detail}</span>}
        {editing ? (
          <input
            className="journal__note-input"
            value={draft}
            maxLength={JOURNAL.noteMax}
            placeholder="A note to yourself"
            aria-label={`Your note on “${entry.title}”`}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => finish(true, false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                finish(true, true)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                finish(false, true)
              }
            }}
            data-testid="journal-note-input"
          />
        ) : (
          entry.note && (
            <em className="journal__note" onDoubleClick={start} data-testid="journal-note">
              {entry.note}
            </em>
          )
        )}
      </div>
      <div className="journal__side">
        <time className="journal__time" dateTime={new Date(entry.at).toISOString()}>
          {time(entry.at)}
        </time>
        <button
          ref={editButton}
          className={`icon-btn icon-btn--ghost journal__note-btn ${editing ? 'is-editing' : ''}`}
          onClick={start}
          aria-label={entry.note ? `Edit your note on “${entry.title}”` : `Add a note to “${entry.title}”`}
          title={entry.note ? 'Edit your note' : 'Add a note'}
          data-testid="journal-note-edit"
        >
          <Icon name="edit" size={14} />
        </button>
      </div>
    </li>
  )
}

/**
 * A line never changes once written, except for its note, so it renders again
 * only when that does. Every change to the farm copies the journal, so the
 * lines are told apart by id rather than by object.
 */
const Entry = memo(EntryLine, (a, b) => a.entry.id === b.entry.id && a.entry.note === b.entry.note)

/** Journal → Journal: what happened, day by day, newest first. */
export function JournalTab() {
  const all = useGame((s) => s.game.journal)
  // Lines of switched-off features stay in the save but aren't shown (see features.ts).
  const journal = useMemo(() => shownLines(all), [all])
  // The day labels change at midnight, not with every tick: follow the date, not the clock.
  const today = useGame((s) => localDateKey(s.now))
  const [kind, setKind] = useState<JournalKind | 'all'>('all')
  const [shown, setShown] = useState(PAGE)
  const root = useRef<HTMLDivElement>(null)
  /** The first line "Show older" brought in, to focus once it's there. */
  const focusAt = useRef<number | null>(null)

  const kinds = useMemo(() => JOURNAL_KINDS.filter((k) => journal.some((e) => e.kind === k)), [journal])
  const active = kind !== 'all' && kinds.includes(kind) ? kind : 'all'
  const lines = useMemo(() => (active === 'all' ? journal : journal.filter((e) => e.kind === active)), [journal, active])
  const days = useMemo(() => byDay(lines.slice(0, shown)), [lines, shown])

  useEffect(() => {
    const at = focusAt.current
    if (at === null) return
    focusAt.current = null
    root.current?.querySelectorAll<HTMLElement>('[data-testid="journal-entry"]')[at]?.focus()
  }, [shown])

  if (!journal.length) return <p className="muted small">Nothing written down yet. It fills in as the island grows.</p>

  const pick = (k: JournalKind | 'all') => {
    setKind(k)
    setShown(PAGE)
  }
  const older = () => {
    // The last page takes the button away with it: focus moves on to the first line it brought in.
    if (shown + PAGE >= lines.length) focusAt.current = shown
    setShown(shown + PAGE)
  }
  const labelAt = noonOf(today)

  return (
    <div className="journal" ref={root} data-testid="journal">
      {kinds.length > 1 && (
        <div className="journal__filters" role="group" aria-label="Show lines about">
          {(['all', ...kinds] as const).map((k) => (
            <button
              key={k}
              className={`filter-chip ${active === k ? 'is-active' : ''}`}
              aria-pressed={active === k}
              onClick={() => pick(k)}
              data-testid={`journal-filter-${k}`}
            >
              {k !== 'all' && <Icon name={KIND_ICON[k]} size={14} />}
              {k === 'all' ? 'Everything' : KIND_LABEL[k]}
            </button>
          ))}
        </div>
      )}
      {days.map(([date, entries]) => (
        <section key={date} className="journal__day" aria-label={dayLabel(date, labelAt)} data-testid="journal-day">
          <h3 className="journal__date">{dayLabel(date, labelAt)}</h3>
          <ol className="journal__entries">
            {entries.map((e) => (
              <Entry key={e.id} entry={e} />
            ))}
          </ol>
        </section>
      ))}
      {lines.length > shown && (
        <button className="btn btn--small journal__older" onClick={older} data-testid="journal-show-older">
          Show older
        </button>
      )}
    </div>
  )
}
