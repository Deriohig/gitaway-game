import { lazy, Suspense, useEffect } from 'react'
import { startAmbient, stopAmbient } from './audio/ambient'
import { startMusic, stopMusic } from './audio/music'
import { isOn } from './game/features'
import { useGitWatcher } from './integrations/useGitWatcher'
import { useGame } from './store/game'
import { CompactBar, FarmBadge, NextCrop, Resources, Toolbar, useCompactHud } from './ui/Hud'
import { FarmPanel } from './ui/panels/FarmPanel'
import { GardenPanel } from './ui/panels/GardenPanel'
import { InventoryPanel } from './ui/panels/InventoryPanel'
import { IslandPanel } from './ui/panels/island/IslandPanel'
import { JournalPanel } from './ui/panels/journal/JournalPanel'
import { ProgressPanel } from './ui/panels/ProgressPanel'
import { SettingsPanel } from './ui/panels/SettingsPanel'
import { ShopPanel } from './ui/panels/ShopPanel'
import { PhotoMode } from './ui/PhotoMode'
import { Recap } from './ui/Recap'
import { SessionCard } from './ui/SessionCard'
import { StudioOverlay } from './ui/StudioOverlay'
import { panelShown } from './ui/surfaces'
import { Toasts } from './ui/Toasts'
import { Tutorial } from './ui/Tutorial'
import { Welcome } from './ui/Welcome'
import { useWindowLayout } from './ui/windowLayout'
import { World } from './world/World'

// Development builds (`npm run dev`, `tauri dev`) and dev-tools builds
// (`npm run build:devtools`, the "Gitaway Dev" desktop app) get a small Dev
// panel for granting resources and skipping time. The build replaces the
// condition with a literal `false` everywhere else, so ordinary production
// builds leave the panel and its helpers out entirely.
const DevPanel = __DEV_TOOLS__ ? lazy(() => import('./dev/DevPanel')) : null

const PANELS = {
  farm: FarmPanel,
  garden: GardenPanel,
  shop: ShopPanel,
  inventory: InventoryPanel,
  island: IslandPanel,
  journal: JournalPanel,
  progress: ProgressPanel,
  settings: SettingsPanel,
}

function useAmbientSound() {
  const on = useGame((s) => s.loaded && s.game.settings.ambientSound)
  useEffect(() => {
    if (!on) return
    startAmbient()
    return stopAmbient
  }, [on])
}

function useSessionMusic() {
  const on = useGame((s) => s.loaded && s.game.settings.sessionMusic && s.game.session !== null)
  useEffect(() => {
    if (!on) return
    startMusic()
    return stopMusic
  }, [on])
}

export function App() {
  const init = useGame((s) => s.init)
  const tick = useGame((s) => s.tick)
  const loaded = useGame((s) => s.loaded)
  const welcomed = useGame((s) => s.game.settings.welcomed)
  const tutorialDone = useGame((s) => s.game.settings.tutorialDone)
  const panel = useGame((s) => s.panel)
  // A panel of switched-off features stays closed (see surfaces.ts).
  const ActivePanel = panel && panelShown(panel) ? PANELS[panel] : null
  // Small windows (a strip, a corner of the screen, a phone on its side) get one bar (A6, see Hud.tsx).
  const compact = useCompactHud()

  useEffect(() => {
    void init()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [init, tick])
  useAmbientSound()
  useSessionMusic()
  useGitWatcher()
  useWindowLayout()

  return (
    <div className="app" data-ready={loaded ? 'true' : 'false'}>
      <World />
      {loaded && (
        <div className={`hud ${welcomed ? '' : 'hud--hidden'}${compact ? ' hud--compact' : ''}`}>
          {compact ? (
            <div className="hud__compact">
              <CompactBar />
              <Toasts limit={1} />
            </div>
          ) : (
            <>
              <div className="hud__top-left">
                <FarmBadge />
                <SessionCard />
              </div>
              <div className="hud__top-right">
                <Resources />
                <Toasts />
              </div>
              <div className="hud__bottom-left">
                <NextCrop />
              </div>
              <div className="hud__bottom">
                <Toolbar />
              </div>
            </>
          )}
          {ActivePanel && <ActivePanel key={panel} />}
          {welcomed && isOn('journal') && <Recap />}
        </div>
      )}
      {loaded && isOn('studio') && <StudioOverlay />}
      {loaded && isOn('studio') && <PhotoMode />}
      {loaded && !welcomed && <Welcome />}
      {loaded && welcomed && !tutorialDone && <Tutorial />}
      {loaded && DevPanel && (
        <Suspense fallback={null}>
          <DevPanel />
        </Suspense>
      )}
    </div>
  )
}
