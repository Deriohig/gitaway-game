import type { ComponentType } from 'react'
import { Panel } from '../Panel'
import { settingsSections, type SettingsSectionId } from '../surfaces'
import { AttentionSettings } from './settings/Attention'
import { CommitsSettings } from './settings/Commits'
import { DataSettings } from './settings/Data'
import { GeneralSettings } from './settings/General'
import { HelpersSettings } from './settings/Helpers'
import { WhatCountsSettings } from './settings/WhatCounts'
import { WorldSettings } from './settings/World'

// Each section lives in its own file under ./settings, so features can grow
// their own settings without touching each other's. A feature's section shows
// while it's switched on (see surfaces.ts).

const SECTIONS: Record<SettingsSectionId, ComponentType> = {
  general: GeneralSettings,
  attention: AttentionSettings,
  world: WorldSettings,
  helpers: HelpersSettings,
  commits: CommitsSettings,
  whatCounts: WhatCountsSettings,
  data: DataSettings,
}

export function SettingsPanel() {
  return (
    <Panel title="Settings" icon="gear" testId="panel-settings">
      {settingsSections().map(({ id }) => {
        const Settings = SECTIONS[id]
        return <Settings key={id} />
      })}
    </Panel>
  )
}
