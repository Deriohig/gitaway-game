import { useState } from 'react'
import { Panel, Tabs } from '../Panel'
import { storesTabs, storesTitle, type StoresTabId } from '../surfaces'
import { BarnTab } from './stores/BarnTab'
import { ThingsTab } from './stores/ThingsTab'
import { WorkbenchTab } from './stores/WorkbenchTab'

/**
 * Stores: what you have, what the barn keeps, and what the workbench makes.
 * With only the Things tab switched on, it's the plain Inventory it always was.
 */
export function InventoryPanel() {
  const tabs = storesTabs()
  const [tab, setTab] = useState<StoresTabId>('things')
  if (tabs.length === 1) {
    return (
      <Panel title={storesTitle()} icon="inventory" testId="panel-inventory">
        <ThingsTab />
      </Panel>
    )
  }
  return (
    <Panel title={storesTitle()} icon="inventory" testId="panel-inventory">
      <Tabs label="Stores sections" value={tab} onChange={setTab} tabs={tabs} />
      {tab === 'things' && <ThingsTab />}
      {tab === 'barn' && <BarnTab />}
      {tab === 'workbench' && <WorkbenchTab />}
    </Panel>
  )
}
