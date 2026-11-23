import { useState } from 'react'
import { hasUnread } from '../../../game/systems/mail'
import { useGame } from '../../../store/game'
import { Panel, Tabs } from '../../Panel'
import { journalTabs, type JournalTabId } from '../../surfaces'
import { AlmanacTab } from './AlmanacTab'
import { JournalTab } from './JournalTab'
import { LettersTab } from './LettersTab'
import { StampsTab } from './StampsTab'

/** The journal, the almanac, quiet stamps and letters from the island's characters; each tab while its feature is on. */
export function JournalPanel() {
  // Letters shows once one has come, with a seal while any is unread: never a number.
  const lettersArrived = useGame((s) => s.game.mail.letters.length > 0)
  const unread = useGame((s) => hasUnread(s.game))
  const tabs = journalTabs(lettersArrived).map((t) => (t.id === 'letters' ? { ...t, sealed: unread } : t))
  const [tab, setTab] = useState<JournalTabId>(tabs[0]?.id ?? 'journal')
  return (
    <Panel title="Journal" icon="journal" testId="panel-journal">
      {tabs.length > 1 && <Tabs label="Journal sections" value={tab} onChange={setTab} tabs={tabs} />}
      {tab === 'journal' && <JournalTab />}
      {tab === 'almanac' && <AlmanacTab />}
      {tab === 'stamps' && <StampsTab />}
      {tab === 'letters' && <LettersTab />}
    </Panel>
  )
}
