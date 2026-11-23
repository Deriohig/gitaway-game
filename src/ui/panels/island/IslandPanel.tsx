import { useState } from 'react'
import { UNLOCKS } from '../../../game/config'
import { levelForXp } from '../../../game/progression'
import { useGame } from '../../../store/game'
import { Icon } from '../../Icon'
import { Panel, Tabs } from '../../Panel'
import { islandTabs, type IslandTabId } from '../../surfaces'
import { RestorationsTab } from './RestorationsTab'
import { StudioTab } from './StudioTab'

/** The restoration board and the island studio, each while its feature is on. Both open at level 6. */
export function IslandPanel() {
  const level = useGame((s) => levelForXp(s.game.xp))
  const tabs = islandTabs()
  const [tab, setTab] = useState<IslandTabId>(tabs[0]?.id ?? 'restorations')
  return (
    <Panel title="Island" icon="island" testId="panel-island">
      {level < UNLOCKS.island ? (
        <div className="empty empty--stacked" data-testid="island-locked">
          <Icon name="island" size={40} />
          <p>Opens at level {UNLOCKS.island}.</p>
          <p className="muted small">A notice board of old places worth mending, and a studio for moving things about until they look right.</p>
        </div>
      ) : (
        <>
          {tabs.length > 1 && <Tabs label="Island sections" value={tab} onChange={setTab} tabs={tabs} />}
          {tab === 'restorations' && <RestorationsTab />}
          {tab === 'studio' && <StudioTab />}
        </>
      )}
    </Panel>
  )
}
