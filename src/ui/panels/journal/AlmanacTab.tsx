import { useState } from 'react'
import { Tabs } from '../../Panel'
import { almanacPageList, type AlmanacPageId } from './almanac'

/** Journal → Almanac (A2): everything found so far, one page per kind of thing. */
export function AlmanacTab() {
  const pages = almanacPageList()
  const [chosen, setPage] = useState<AlmanacPageId | null>(null)
  // The first page until another is chosen; nothing at all while no page is switched on.
  const current = pages.find((p) => p.id === chosen) ?? pages[0]
  if (!current) return null
  return (
    <div className="almanac" data-testid="almanac">
      {/* Page tabs only when there is more than one page to turn to, as with the Journal's own tabs. */}
      {pages.length > 1 && <Tabs label="Almanac pages" value={current.id} onChange={setPage} tabs={pages.map(({ id, label }) => ({ id, label }))} />}
      <current.Page />
    </div>
  )
}
