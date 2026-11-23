import { useState } from 'react'
import { SESSION, TASKS } from '../game/config'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { endSession, logTask, sessionPreview, startSession, type Result } from '../game/engine'
import { isOn } from '../game/features'
import type { GameState } from '../game/state'
import { JOURNAL, setNextNote } from '../game/systems/journal'
import { useGame } from '../store/game'
import { FieldNote } from './FieldNote'
import { clock, num } from './format'
import { Icon } from './Icon'

function RecentRewards() {
  const recent = useGame((s) => s.game.recent)
  if (!recent.length) return <p className="muted small session__empty">Rewards from sessions, tasks and harvests show up here.</p>
  return (
    <ul className="recent" aria-label="Recent rewards">
      {recent.slice(0, 3).map((r) => (
        <li key={`${r.at}-${r.label}`}>
          <span className="recent__label">{r.label}</span>
          <span className="recent__values">
            <span className="recent__value">
              <Icon name="coin" size={14} />+{num(r.coins)}
              <span className="sr-only"> coins</span>
            </span>
            {r.wood > 0 && (
              <span className="recent__value" data-testid="recent-wood">
                <Icon name="wood" size={14} />+{num(r.wood)}
                <span className="sr-only"> wood</span>
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}

function TaskForm() {
  const run = useGame((s) => s.run)
  const tasksToday = useGame((s) => s.game.daily.tasks.length)
  // Fair counting (A7) shows no "n/12": the field says so in words near the cap.
  const counted = !isOn('fairCounting')
  const [title, setTitle] = useState('')
  return (
    <form
      className="task-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (run((s, now) => logTask(s, title, now))) setTitle('')
      }}
    >
      <label className="sr-only" htmlFor="task-title">
        Log a finished task
      </label>
      <input
        id="task-title"
        value={title}
        maxLength={TASKS.maxTitleLength}
        placeholder="Log a finished task"
        autoComplete="off"
        onChange={(e) => setTitle(e.target.value)}
        data-testid="task-input"
      />
      <button className="btn btn--icon" type="submit" aria-label="Log task" disabled={!title.trim()} data-testid="task-submit">
        <Icon name="plus" size={18} />
      </button>
      {counted && (
        <span className="task-form__count" title="Rewarded tasks today">
          {tasksToday}/{TASKS.dailyLimit}
        </span>
      )}
    </form>
  )
}

/** "Note for next time": written while working, kept when the session ends. */
function NextNoteField({ draft, setDraft }: { draft: string; setDraft: (v: string) => void }) {
  const run = useGame((s) => s.run)
  const save = () => run((s) => setNextNote(s, draft))
  return (
    <div className="next-note-field">
      <label htmlFor="next-note" className="small muted">
        Note for next time <span className="next-note-field__optional">(optional)</span>
      </label>
      <input
        id="next-note"
        value={draft}
        maxLength={JOURNAL.noteMax}
        placeholder="Where to pick up"
        autoComplete="off"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            save()
          }
        }}
        data-testid="next-note-input"
      />
    </div>
  )
}

/** On the idle card: what you noted last time, with a way to clear it. */
function LastNote() {
  const nextNote = useGame((s) => s.game.nextNote)
  const run = useGame((s) => s.run)
  if (!nextNote) return null
  return (
    <div className="last-note" data-testid="next-note">
      <Icon name="journal" size={18} />
      <p>
        <span className="last-note__label">Last time you noted:</span> {nextNote}
      </p>
      <button className="icon-btn icon-btn--ghost" onClick={() => run((s) => setNextNote(s, ''))} aria-label="Clear the note for next time" data-testid="next-note-clear">
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}

/** Ends the session, keeping the note for next time as it stands in the field. */
const endWithNote =
  (draft: string) =>
  (state: GameState, now: number): Result => {
    const noted = setNextNote(state, draft)
    return endSession(noted.state, now)
  }

export function SessionCard() {
  const session = useGame((s) => s.game.session)
  const farmOnly = useGame((s) => s.game.settings.farmOnly)
  const savedCollapsed = useGame((s) => s.game.settings.sessionPanelCollapsed)
  const nextNote = useGame((s) => s.game.nextNote)
  const now = useGame((s) => s.now)
  const game = useGame((s) => s.game)
  const run = useGame((s) => s.run)
  const setSettings = useGame((s) => s.setSettings)
  // On a phone the card starts small so the island stays in view.
  const phone = useMediaQuery('(max-width: 720px)')
  const [openOnPhone, setOpenOnPhone] = useState(false)
  // The note field starts from the note already kept, so ending a session never loses it by accident.
  const [draft, setDraft] = useState(nextNote)
  const [draftFor, setDraftFor] = useState(session?.startedAt ?? null)
  if ((session?.startedAt ?? null) !== draftFor) {
    setDraftFor(session?.startedAt ?? null)
    setDraft(nextNote)
  }
  // A session already running stays on screen, so it can be ended and paid.
  if (farmOnly && !session) return null
  const collapsed = phone ? !openOnPhone : savedCollapsed
  const setCollapsed = (value: boolean) => (phone ? setOpenOnPhone(!value) : setSettings({ sessionPanelCollapsed: value }))
  const preview = sessionPreview(game, now)
  const elapsed = session ? Math.max(0, now - session.startedAt) : 0
  // The note for next time is part of the journal (A1, see features.ts).
  const notes = isOn('journal')

  // Ending always keeps the note as the field has it, folded away or not: a
  // click doesn't blur the field in every browser (Safari), so its own save
  // may never have run.
  const toggleSession = () => run(session ? (notes ? endWithNote(draft) : endSession) : startSession)
  const sessionButton = (
    <button
      className={`btn ${session ? 'btn--quiet' : 'btn--primary'} btn--block`}
      onClick={toggleSession}
      data-testid={session ? 'end-session' : 'start-session'}
    >
      <Icon name={session ? 'stop' : 'play'} size={16} />
      {session ? 'End session' : 'Start work session'}
    </button>
  )

  if (collapsed) {
    // Folded away (as it starts on a phone), the card still shows that a note for next time is kept inside.
    const noteKept = notes && !!nextNote
    return (
      <section className="card session session--collapsed" aria-label="Work session" data-tour="session">
        <button
          className="session__pill"
          onClick={toggleSession}
          aria-label={session ? `Working for ${clock(elapsed)}. End session` : 'Start work session'}
          data-testid={session ? 'end-session' : 'start-session'}
        >
          <span className={`dot ${session ? 'dot--on' : ''}`} />
          {session ? clock(elapsed) : 'Start session'}
        </button>
        <button
          className={`icon-btn icon-btn--ghost ${noteKept ? 'session__expand--note' : ''}`}
          onClick={() => setCollapsed(false)}
          aria-label={noteKept ? 'Expand work session panel, with your note for next time' : 'Expand work session panel'}
          title={noteKept ? 'Your note for next time is in here' : undefined}
          data-testid="session-expand"
        >
          {noteKept && <Icon name="journal" size={16} />}
          <Icon name="chevronDown" size={18} />
        </button>
      </section>
    )
  }

  // With fair counting (A7) a full day is the field's to tell (FieldNote below).
  const fair = isOn('fairCounting')
  const capNote = fair
    ? preview.cap === 'session'
      ? 'This session has earned all it can. A proper break would do nicely.'
      : null
    : preview.cap === 'session'
      ? `This session has earned all it can (${SESSION.maxMinutes / 60} h). Take a break.`
      : preview.cap === 'daily'
        ? "Today's rewards are all collected. Anything more is just for fun."
        : null

  return (
    <section className="card session" aria-label="Work session" data-tour="session">
      <header className="session__head">
        <Icon name="laptop" size={26} />
        <h2>Work session</h2>
        <button className="icon-btn icon-btn--ghost" onClick={() => setCollapsed(true)} aria-label="Collapse work session panel">
          <Icon name="chevronUp" size={18} />
        </button>
      </header>
      <div className="session__timer" aria-live="off" data-testid="session-timer">
        {clock(elapsed)}
      </div>
      <div className="session__status">
        <span className={`dot ${session ? 'dot--on' : ''}`} />
        {session ? 'Clocked in' : 'Not working. Enjoy the view.'}
      </div>
      {session && (
        <div className="session__earn" data-testid="session-estimate">
          <span>You'll earn</span>
          <strong>
            <Icon name="coin" size={16} /> +{preview.coins}
          </strong>
          {preview.wood > 0 && (
            <strong>
              <Icon name="wood" size={16} /> +{preview.wood}
            </strong>
          )}
        </div>
      )}
      {!session && notes && <LastNote />}
      {capNote && <p className="note">{capNote}</p>}
      {fair && <FieldNote which={['focus', 'tasks']} />}
      {session && notes && <NextNoteField draft={draft} setDraft={setDraft} />}
      {sessionButton}
      <TaskForm />
      <RecentRewards />
    </section>
  )
}
