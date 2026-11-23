import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { BONUS, COMMITS, LAND, LEVEL_XP, PRICING, SESSION, TASKS, levelBonus } from '../../../game/config'
import { recordCommits, watchRepository } from '../../../game/engine'
import { createInitialState } from '../../../game/state'
import { REPO_ALIASES } from '../../../game/systems/gitEvents'
import { withFeatures } from '../../../game/testing'
import { useGame } from '../../../store/game'
import { settingsSections } from '../../surfaces'
import { WhatCountsSettings } from './WhatCounts'

/** The page's words, as a reader sees them. */
const text = () =>
  renderToStaticMarkup(createElement(WhatCountsSettings))
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')

/** Config values changed by a test, put back after it. */
const undo: (() => void)[] = []
function setConfig(table: object, key: string, value: number) {
  const t = table as Record<string, number>
  const old = t[key]
  t[key] = value
  undo.push(() => (t[key] = old))
}
afterEach(() => {
  while (undo.length) undo.pop()!()
})

/** The text of every string and template literal in a source file (without `${…}` parts), and of JSX text between tags; comments left out. */
function wordsIn(file: string): string[] {
  const src = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')
  // One pass, so a "//" inside a string is not a comment and a quote inside a comment is not a string.
  const tokens = [...src.matchAll(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|(['"`])((?:\\[\s\S]|(?!\1)[\s\S])*?)\1/g)]
  const words = tokens.filter((m) => m[1]).map((m) => m[2].replace(/\$\{[^}]*\}/g, ' '))
  return file.endsWith('.tsx') ? [...words, ...[...src.matchAll(/>([^<>{}]*)</g)].map((m) => m[1])] : words
}

const pct = (n: number) => Math.round(n * 100)

describe('Settings → What counts', () => {
  it('sets out how sessions, tasks, commits, crops, caps and prices pay, and the privacy rules', () => {
    const page = text()
    for (const heading of ['Work sessions', 'Tasks', 'Commits', 'Crops', 'Caps and rest', 'Prices', 'Privacy']) expect(page).toContain(heading)
    for (const sentence of [
      `Every minute of a work session earns ${SESSION.coinsPerMinute} coins and ${SESSION.xpPerMinute} XP`,
      `up to ${SESSION.dailyMinuteCap / 60} hours of focus, ${TASKS.dailyLimit} tasks and ${COMMITS.dailyLimit} commits earn rewards`,
      'the field is full for today',
      'Everything stays on this device.',
      `Repositories go by tree names (${REPO_ALIASES[0]}, ${REPO_ALIASES[1]} and so on)`,
    ]) expect(page).toContain(sentence)
    expect(page).not.toMatch(/behind|limit|quota/i)
  })

  it('says the counting rules exactly as the game keeps them', () => {
    const page = text()
    for (const sentence of [
      'Once one of them is reached, that part of the field is full for today; the others still count.',
      "Merges, empty commits and commits already counted don't count, and a commit seen again in another watched folder is passed over.",
      'A commit pays on the day Gitaway first sees it, even if its date is ahead of your clock.',
      // The cursor: the newest counted commit's date, or the time it was seen if that was ahead of the clock.
      'Only commits dated after the newest one already counted can count, or after you started watching if none has been. If that one was dated ahead of your clock, anything dated after Gitaway saw it can.',
      `A crop that differs from the one its bed grew last, or a bed's first crop, sells for ${pct(BONUS.freshSoil)}% more.`,
      `with the greenhouse, new crops grow ${pct(BONUS.greenhouseGrowth)}% faster.`,
      `Beyond those you started with, each extra one of anything else you can own several of costs ${pct(PRICING.repeatGrowth - 1)}% more than the last.`,
      `then each piece costs ${pct(LAND.coins.growth - 1)}% more coins and ${pct(LAND.wood.growth - 1)}% more wood than the one before.`,
      "Nothing on the island decays, expires or resets while you're away.",
    ]) expect(page).toContain(sentence)
    expect(page).not.toMatch(/wherever they turn up|whatever its date says|Ones dated earlier|for each (one|piece) you (already )?have/)
  })

  it('works out the level gift from a gift that grows by the same amount each level', () => {
    const step = levelBonus(1) - levelBonus(0)
    for (let level = 0; level <= LEVEL_XP.length + 10; level++) expect(levelBonus(level), `level ${level}`).toBe(levelBonus(0) + step * level)
  })

  it('reads its numbers from config: change one, and the page says so', () => {
    const before = text()
    setConfig(TASKS, 'dailyLimit', TASKS.dailyLimit + 5)
    setConfig(SESSION, 'coinsPerMinute', SESSION.coinsPerMinute + 3)
    setConfig(COMMITS, 'coins', COMMITS.coins + 7)
    const after = text()
    expect(after).not.toBe(before)
    expect(after).toContain(`${TASKS.dailyLimit} tasks and`)
    expect(after).toContain(`earns ${SESSION.coinsPerMinute} coins and`)
    expect(after).toContain(`earns ${COMMITS.coins} coins and ${COMMITS.xp} XP`)
  })

  it('types no number into its words: every one comes from config', () => {
    const words = [...wordsIn('./whatCountsRules.ts'), ...wordsIn('./WhatCounts.tsx')]
    expect(words.length).toBeGreaterThan(20)
    expect(words.filter((w) => /\d/.test(w))).toEqual([])
  })

  it("tells nothing of the player's own progress, and names no repository", () => {
    const fresh = createInitialState(Date.UTC(2026, 9, 19, 9))
    useGame.setState({ game: fresh })
    const before = text()
    let busy = watchRepository({ ...fresh, xp: 9000, coins: 12_345 }, { path: '/work/secret-client-app', name: 'secret-client-app' }, fresh.createdAt).state
    busy = recordCommits(busy, busy.repos[0].path, { count: 4, latest: busy.repos[0].cursor + 60, since: busy.repos[0].cursor }, fresh.createdAt + 120_000).state
    useGame.setState({ game: busy })
    expect(text()).toBe(before)
    expect(text()).not.toContain('secret-client-app')
  })

  it('shows in Settings only while fair counting is on', () => {
    const ids = () => settingsSections().map((s) => s.id)
    expect(withFeatures({ fairCounting: true }, ids)).toContain('whatCounts')
    expect(withFeatures({ fairCounting: false }, ids)).not.toContain('whatCounts')
  })
})
