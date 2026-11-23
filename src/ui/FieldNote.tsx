import { sessionPreview } from '../game/engine'
import { fieldNote, fieldToday, type Counted } from '../game/fairCounting'
import { useGame } from '../store/game'

/**
 * Fair counting (A7): near or at today's caps for `which`, a soft line in
 * words; below them, nothing at all. Never a counter.
 */
export function FieldNote({ which }: { which: Counted[] }) {
  const game = useGame((s) => s.game)
  const now = useGame((s) => s.now)
  const note = fieldNote(fieldToday(game, now, sessionPreview(game, now).creditedMinutes), which)
  if (!note) return null
  return (
    <p className={`note field-note field-note--${note.fill}`} role="status" data-testid="field-note">
      <strong>{note.title}</strong> {note.line}
    </p>
  )
}
