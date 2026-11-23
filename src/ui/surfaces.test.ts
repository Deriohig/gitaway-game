import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { isOn, type FeatureId } from '../game/features'
import { ALL_OFF, ALL_ON, withFeatures, type Switches } from '../game/testing'
import { Toolbar } from './Hud'
import { almanacPages, islandTabs, journalTabs, panelShown, settingsSections, storesTabs, storesTitle, toolbarTools } from './surfaces'

const on = <T,>(switches: Switches, fn: () => T) => withFeatures({ ...ALL_OFF, ...switches }, fn)
const ids = (list: { id: string }[]) => list.map((t) => t.id)

/** The toolbar a player should see, worked out by hand from the spec and the switches, not from surfaces.ts. */
function toolsBySpec(): string[] {
  const any = (...features: FeatureId[]) => features.some(isOn)
  const tools = [
    'Farm',
    'Garden',
    'Shop',
    isOn('workshop') ? 'Stores' : 'Inventory',
    ...(any('restorations', 'studio') ? ['Island'] : []),
    ...(any('journal', 'almanac', 'workshop', 'visitors', 'fishing', 'stamps', 'letters') ? ['Journal'] : []),
    'Progress',
  ]
  return tools.map((t, i) => `${i + 1} ${t}`)
}

/** The toolbar as drawn: each button's number key and label, in order. */
function drawnTools(): string[] {
  const html = renderToStaticMarkup(createElement(Toolbar))
  const keys = [...html.matchAll(/aria-keyshortcuts="(\d)"/g)].map((m) => m[1])
  const labels = [...html.matchAll(/<span class="tool__label">([^<]*)<\/span>/g)].map((m) => m[1])
  expect(keys).toHaveLength(labels.length)
  return labels.map((label, i) => `${keys[i]} ${label}`)
}

describe('the toolbar', () => {
  it('is drawn as a player should see it, with the committed switches and others', () => {
    expect(drawnTools()).toEqual(toolsBySpec())
    for (const switches of [ALL_OFF, ALL_ON, { ...ALL_OFF, journal: true }, { ...ALL_OFF, studio: true, workshop: true }, { ...ALL_OFF, visitors: true }]) {
      withFeatures(switches, () => expect(drawnTools(), JSON.stringify(switches)).toEqual(toolsBySpec()))
    }
  })

  it('shows only tools that have something in them, numbered in order', () => {
    const tools = toolbarTools()
    for (const t of tools) expect(panelShown(t.id), t.id).toBe(true)
    expect(tools.map((t) => t.key)).toEqual(tools.map((_, i) => String(i + 1)))
    expect(ids(tools).includes('journal')).toBe(journalTabs().length > 0)
    expect(ids(tools).includes('island')).toBe(islandTabs().length > 0)
  })
})

describe('with every feature switched off', () => {
  it('has the five tools the game always had, with Inventory, and no journal, island or almanac', () => {
    withFeatures(ALL_OFF, () => {
      expect(toolbarTools()).toEqual(
        [['farm', 'Farm'], ['garden', 'Garden'], ['shop', 'Shop'], ['inventory', 'Inventory'], ['progress', 'Progress']].map(([id, label], i) => ({ id, label, icon: id, key: String(i + 1) })),
      )
      expect(ids(storesTabs())).toEqual(['things'])
      expect(storesTitle()).toBe('Inventory')
      expect([journalTabs(), islandTabs(), almanacPages()]).toEqual([[], [], []])
      expect([panelShown('journal'), panelShown('island'), panelShown('settings')]).toEqual([false, false, true])
      expect(ids(settingsSections())).toEqual(['general', 'attention', 'world', 'commits', 'data'])
    })
  })
})

describe('flipping a switch on', () => {
  const tools = () => ids(toolbarTools())
  const pages = () => ids(almanacPages())
  const sections = () => ids(settingsSections())
  it.each<[string, Switches, () => unknown, unknown]>([
    ['Journal brings the Journal tool, numbering Progress 6', { journal: true }, tools, ['farm', 'garden', 'shop', 'inventory', 'journal', 'progress']],
    ['Journal brings just its Journal tab', { journal: true }, () => ids(journalTabs()), ['journal']],
    ['visitors opens the almanac with its page only', { visitors: true }, () => [ids(journalTabs()), pages()], [['almanac'], ['visitors']]],
    ['almanac and fishing open their pages only', { almanac: true, fishing: true }, pages, ['crops', 'animals', 'buildings', 'fish']],
    ['stamps and letters bring their tabs once a letter has come', { stamps: true, letters: true }, () => ids(journalTabs(true)), ['stamps', 'letters']],
    ['letters bring no tab before a letter has come (nobody sees an empty tab)', { journal: true, letters: true }, () => [ids(journalTabs()), ids(journalTabs(false)), ids(journalTabs(true))], [['journal'], ['journal'], ['journal', 'letters']]],
    ['letters in the save bring no tab with the switch off', { journal: true }, () => ids(journalTabs(true)), ['journal']],
    ['the workshop turns Inventory into Stores and fills the almanac Goods page', { workshop: true }, () => [ids(storesTabs()), storesTitle(), toolbarTools().find((t) => t.id === 'inventory')?.label, pages()], [['things', 'barn', 'workbench'], 'Stores', 'Stores', ['goods']]],
    ['restorations bring the Island tool', { restorations: true }, () => ids(islandTabs()), ['restorations']],
    ['the studio brings the Island tool', { studio: true }, () => [ids(islandTabs()), tools().includes('island')], [['studio'], true]],
    ['helpers brings its Settings section', { helpers: true }, () => sections().includes('helpers'), true],
    ['fair counting brings the What counts section', { fairCounting: true }, () => sections().includes('whatCounts'), true],
  ])('%s', (_, switches, read, expected) => {
    expect(on(switches, read)).toEqual(expected)
  })

  it('with everything on, has all seven tools and every tab', () => {
    withFeatures(ALL_ON, () => {
      expect(toolbarTools().map((t) => `${t.key} ${t.label}`)).toEqual(['1 Farm', '2 Garden', '3 Shop', '4 Stores', '5 Island', '6 Journal', '7 Progress'])
      expect(ids(journalTabs(true))).toEqual(['journal', 'almanac', 'stamps', 'letters'])
      expect([almanacPages().length, settingsSections().length]).toEqual([6, 7])
    })
  })
})
