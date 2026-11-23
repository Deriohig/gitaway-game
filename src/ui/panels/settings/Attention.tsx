import { isOn } from '../../../game/features'
import type { MotionPreference, WindowLayout } from '../../../game/state'
import { isDesktop } from '../../../integrations/localGit'
import { useGame } from '../../../store/game'
import { useAttention } from '../../../world/motion'
import { Section } from '../../Panel'
import { reshapeWindow } from '../../windowLayout'
import { Segmented } from './Segmented'

const MOTION: { id: MotionPreference; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'full', label: 'Lively' },
  { id: 'calm', label: 'Calm' },
  { id: 'still', label: 'Still' },
]

const LAYOUTS: { id: WindowLayout; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'strip', label: 'Strip' },
  { id: 'corner', label: 'Corner' },
]

/** Settings → Attention: how much the island moves and asks for notice. The dial's own settings show while its switch (A6) is on. */
export function AttentionSettings() {
  return isOn('attention') ? <AttentionDial /> : <MotionSection />
}

function MotionSection({ note }: { note?: string }) {
  const motion = useGame((s) => s.game.settings.motion)
  const setSettings = useGame((s) => s.setSettings)
  return (
    <Section title="Motion">
      <Segmented label="Motion" value={motion} options={MOTION} onChange={(m) => setSettings({ motion: m })} />
      <p className="muted small">
        Auto follows your system's reduced-motion setting. Still draws the island without animation.
        {note && ` ${note}`}
      </p>
    </Section>
  )
}

/** Quiet mode, saving power on battery, the motion level and, in the desktop app, the window's layout. */
function AttentionDial() {
  const settings = useGame((s) => s.game.settings)
  const setSettings = useGame((s) => s.setSettings)
  const { level, quiet, saving } = useAttention()
  // Said only when the dial has calmed a livelier choice (Auto or Lively); Calm and Still are already as calm.
  const calmed = level === 'calm' && settings.motion !== 'calm'
  return (
    <>
      <Section title="Attention">
        <label className="switch" data-testid="quiet-mode">
          <input type="checkbox" checked={settings.quiet} onChange={(e) => setSettings({ quiet: e.target.checked })} />
          <span className="switch__track" aria-hidden="true" />
          <span>Quiet mode</span>
        </label>
        <p className="muted small">Fewer frames, the animals stay put, and no pop-up notes. The journal still writes everything down.</p>
        <label className="switch" data-testid="battery-saver">
          <input type="checkbox" checked={settings.batterySaver} onChange={(e) => setSettings({ batterySaver: e.target.checked })} />
          <span className="switch__track" aria-hidden="true" />
          <span>Save power on battery</span>
        </label>
        <p className="muted small" data-testid="battery-status">
          {saving ? 'Running on battery, so the island is drawn calmly for now.' : 'Draws the island calmly while this device runs on battery, where it can tell.'}
        </p>
      </Section>
      <MotionSection note={!calmed ? undefined : quiet ? 'Quiet mode keeps it calm for now.' : saving ? 'The battery keeps it calm for now.' : undefined} />
      {isDesktop() && <WindowSection />}
    </>
  )
}

/** The desktop app's window layouts. */
function WindowSection() {
  const layout = useGame((s) => s.game.settings.windowLayout)
  const keepOnTop = useGame((s) => s.game.settings.keepOnTop)
  const setSettings = useGame((s) => s.setSettings)
  return (
    <Section title="Window">
      {/* Picking the layout already chosen makes it again: after a change that failed, that's the way to try again. */}
      <Segmented label="Window layout" value={layout} options={LAYOUTS} onChange={(l) => (l === layout ? reshapeWindow() : setSettings({ windowLayout: l }))} />
      <p className="muted small">Strip is a wide, short window along the bottom of the screen; Corner a small square in its bottom-right corner. Normal goes back to the size it had.</p>
      <label className="switch" data-testid="keep-on-top">
        <input type="checkbox" checked={keepOnTop} onChange={(e) => setSettings({ keepOnTop: e.target.checked })} />
        <span className="switch__track" aria-hidden="true" />
        <span>Keep on top of other windows</span>
      </label>
    </Section>
  )
}
