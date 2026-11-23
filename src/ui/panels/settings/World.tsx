import type { TimeOfDayPreference } from '../../../game/state'
import { useGame } from '../../../store/game'
import { Section } from '../../Panel'

const TIMES: { id: TimeOfDayPreference; label: string }[] = [
  { id: 'clock', label: 'Follow my clock' },
  { id: 'morning', label: 'Always morning' },
  { id: 'afternoon', label: 'Always afternoon' },
  { id: 'evening', label: 'Always evening' },
  { id: 'night', label: 'Always night' },
]

/** Settings → World: the light, and later the seasons and weather. */
export function WorldSettings() {
  const timeOfDay = useGame((s) => s.game.settings.timeOfDay)
  const setSettings = useGame((s) => s.setSettings)
  return (
    <Section title="Time of day">
      <label className="sr-only" htmlFor="time-of-day">
        Time of day
      </label>
      <select id="time-of-day" className="select" value={timeOfDay} onChange={(e) => setSettings({ timeOfDay: e.target.value as TimeOfDayPreference })} data-testid="time-of-day">
        {TIMES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
    </Section>
  )
}
