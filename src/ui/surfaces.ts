// Which tools, panel tabs, almanac pages and settings sections the player
// sees with the feature switches as they are (see game/features.ts). A tab,
// page or section shows while its feature is switched on; a tool whose every
// tab is hidden disappears, and the toolbar's number keys follow the tools
// that are left. Pure and read when called, so tests can flip a switch.

import { isOn, type FeatureId } from '../game/features'
import type { PanelId } from '../store/game'

export interface Surface<T extends string> {
  id: T
  label: string
  /** Shown only while this feature is switched on. Left out, it's always shown. */
  feature?: FeatureId
}

const shown = <T extends string>(list: readonly Surface<T>[]): Surface<T>[] => list.filter((s) => !s.feature || isOn(s.feature))

// ---------------------------------------------------------------------------
// Panel tabs

export type StoresTabId = 'things' | 'barn' | 'workbench'

export const STORES_TABS: readonly Surface<StoresTabId>[] = [
  { id: 'things', label: 'Things' },
  { id: 'barn', label: 'Barn', feature: 'workshop' },
  { id: 'workbench', label: 'Workbench', feature: 'workshop' },
]

export type AlmanacPageId = 'crops' | 'animals' | 'buildings' | 'goods' | 'visitors' | 'fish'

/** The almanac's pages, in order, each with the feature that fills it in. */
export const ALMANAC_PAGES_ALL: readonly Surface<AlmanacPageId>[] = [
  { id: 'crops', label: 'Crops', feature: 'almanac' },
  { id: 'animals', label: 'Animals', feature: 'almanac' },
  { id: 'buildings', label: 'Buildings', feature: 'almanac' },
  { id: 'goods', label: 'Goods', feature: 'workshop' },
  { id: 'visitors', label: 'Visitors', feature: 'visitors' },
  { id: 'fish', label: 'Fish', feature: 'fishing' },
]

export type JournalTabId = 'journal' | 'almanac' | 'stamps' | 'letters'

/** The Journal panel's tabs. The almanac shows while any of its pages does. */
export const JOURNAL_TABS: readonly Surface<JournalTabId>[] = [
  { id: 'journal', label: 'Journal', feature: 'journal' },
  { id: 'almanac', label: 'Almanac' },
  { id: 'stamps', label: 'Stamps', feature: 'stamps' },
  { id: 'letters', label: 'Letters', feature: 'letters' },
]

export type IslandTabId = 'restorations' | 'studio'

export const ISLAND_TABS: readonly Surface<IslandTabId>[] = [
  { id: 'restorations', label: 'Restorations', feature: 'restorations' },
  { id: 'studio', label: 'Studio', feature: 'studio' },
]

export const storesTabs = () => shown(STORES_TABS)
export const almanacPages = () => shown(ALMANAC_PAGES_ALL)
/**
 * The Journal panel's tabs. Letters shows once a letter has come (`lettersArrived`), so nobody sees an empty tab that
 * hints something is coming; called without it, as the toolbar does, Letters stays hidden.
 */
export const journalTabs = (lettersArrived = false) =>
  shown(JOURNAL_TABS).filter((t) => (t.id !== 'almanac' || almanacPages().length > 0) && (t.id !== 'letters' || lettersArrived))
export const islandTabs = () => shown(ISLAND_TABS)

/** With only its Things tab, the Stores tool looks as the old Inventory did. */
export const storesTitle = () => (storesTabs().length > 1 ? 'Stores' : 'Inventory')

// ---------------------------------------------------------------------------
// Settings

export type SettingsSectionId = 'general' | 'attention' | 'world' | 'helpers' | 'commits' | 'whatCounts' | 'data'

/**
 * Settings sections in order. Attention and World hold the motion and light
 * settings every farm has; their idle-loop additions check their own switch.
 */
export const SETTINGS_SECTIONS: readonly Surface<SettingsSectionId>[] = [
  { id: 'general', label: 'General' },
  { id: 'attention', label: 'Attention' },
  { id: 'world', label: 'World' },
  { id: 'helpers', label: 'Helpers', feature: 'helpers' },
  { id: 'commits', label: 'Commits' },
  { id: 'whatCounts', label: 'What counts', feature: 'fairCounting' },
  { id: 'data', label: 'Data' },
]

export const settingsSections = () => shown(SETTINGS_SECTIONS)

// ---------------------------------------------------------------------------
// The toolbar

export type ToolId = Exclude<PanelId, 'settings'>

export interface Tool {
  id: ToolId
  label: string
  icon: string
  /** The number key that opens it: its place on the toolbar. */
  key: string
}

const TOOLS: readonly Omit<Tool, 'key'>[] = [
  { id: 'farm', label: 'Farm', icon: 'farm' },
  { id: 'garden', label: 'Garden', icon: 'garden' },
  { id: 'shop', label: 'Shop', icon: 'shop' },
  { id: 'inventory', label: 'Stores', icon: 'inventory' },
  { id: 'island', label: 'Island', icon: 'island' },
  { id: 'journal', label: 'Journal', icon: 'journal' },
  { id: 'progress', label: 'Progress', icon: 'progress' },
]

/** Whether a panel is part of the game right now. */
export function panelShown(id: PanelId): boolean {
  if (id === 'island') return islandTabs().length > 0
  if (id === 'journal') return journalTabs().length > 0
  return true
}

/** The tools on the toolbar, in order, numbered 1, 2, 3… */
export function toolbarTools(): Tool[] {
  return TOOLS.filter((t) => panelShown(t.id)).map((t, i) => ({
    ...t,
    label: t.id === 'inventory' ? storesTitle() : t.label,
    key: String(i + 1),
  }))
}
