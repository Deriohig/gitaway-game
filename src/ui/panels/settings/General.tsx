import { FARM_ONLY } from '../../../game/config'
import { useGame } from '../../../store/game'
import { Icon } from '../../Icon'
import { Section } from '../../Panel'
import { toolbarTools } from '../../surfaces'

/** Settings → General: how you play, sound and help. */
export function GeneralSettings() {
  const settings = useGame((s) => s.game.settings)
  const setSettings = useGame((s) => s.setSettings)
  return (
    <>
      <Section title="How you play">
        <label className="switch" data-testid="farm-only">
          <input type="checkbox" checked={settings.farmOnly} onChange={(e) => setSettings({ farmOnly: e.target.checked })} />
          <span className="switch__track" aria-hidden="true" />
          <span>Just here for the farm</span>
        </label>
        <p className="muted small">
          For playing without any work to bring. Harvests and what the farm makes pay {FARM_ONLY.pay} times as much, in coins, wood and XP.
          Work sessions, tasks and commits stop paying, and the work card goes away.
        </p>
      </Section>

      <Section title="Sound">
        <label className="switch">
          <input type="checkbox" checked={settings.ambientSound} onChange={(e) => setSettings({ ambientSound: e.target.checked })} data-testid="ambient-sound" />
          <span className="switch__track" aria-hidden="true" />
          <span>Ambient breeze and birdsong</span>
        </label>
        <label className="switch" data-testid="session-music-toggle">
          <input type="checkbox" checked={settings.sessionMusic} onChange={(e) => setSettings({ sessionMusic: e.target.checked })} />
          <span className="switch__track" aria-hidden="true" />
          <span>Music during work sessions</span>
        </label>
        <p className="muted small">
          Music plays only while a work session runs: Lofi Study Session, Lofi Studying and Lofi Harp &amp; Gamelan, by Freaq Studios.
          The breeze is off by default.
        </p>
      </Section>

      <Section title="Help">
        <button className="btn btn--small" onClick={() => setSettings({ tutorialDone: false })} data-testid="replay-tutorial">
          <Icon name="question" size={16} /> Show the quick tour again
        </button>
        <p className="muted small">Shortcuts: 1–{toolbarTools().length} open the tools, Esc closes a panel.</p>
      </Section>
    </>
  )
}
