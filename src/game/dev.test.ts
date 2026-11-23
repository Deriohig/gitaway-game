import { describe, expect, it } from 'vitest'
import { GIFTS, LEVEL_XP, levelBonus } from './config'
import { DEV_GRANTS, DEV_SKIPS, formatOffset, grantResources, levelUp, xpToNext } from './dev'
import { levelForXp } from './progression'
import { createInitialState } from './state'

const T0 = Date.UTC(2026, 9, 19, 9, 0, 0)
const fresh = () => createInitialState(T0)
const HOUR = 3_600_000

describe('dev grants', () => {
  it('adds coins and wood without counting them as earnings or touching the journal', () => {
    const s = fresh()
    const coins = grantResources(s, { coins: DEV_GRANTS.coins[1] })
    expect(coins.ok).toBe(true)
    expect(coins.state.coins).toBe(s.coins + 1000)
    expect(coins.state.stats.coinsEarned).toBe(s.stats.coinsEarned)
    expect(coins.notices[0]).toMatchObject({ kind: 'info', title: 'Dev: +1000 coins' })
    const wood = grantResources(coins.state, { wood: DEV_GRANTS.wood[0] })
    expect([wood.state.wood, wood.state.coins]).toEqual([s.wood + 10, s.coins + 1000])
    expect(wood.state.journal).toEqual(s.journal)
  })

  it('leaves the farm alone when there is nothing to grant, and never changes the state it was given', () => {
    const s = fresh()
    expect(grantResources(s, {}).ok).toBe(false)
    expect(grantResources(s, { coins: -50, wood: 0 }).state).toBe(s)
    const before = structuredClone(s)
    grantResources(s, { coins: 100, wood: 50 })
    levelUp(s, T0)
    expect(s).toEqual(before)
  })
})

describe('dev level-up', () => {
  it('grants exactly the XP missing to the next level', () => {
    expect([xpToNext(0), xpToNext(LEVEL_XP[1] - 1), xpToNext(LEVEL_XP[1])]).toEqual([LEVEL_XP[1], 1, LEVEL_XP[2] - LEVEL_XP[1]])
    const up = levelUp({ ...fresh(), xp: 10 }, T0).state
    expect(up.xp).toBe(LEVEL_XP[1])
    expect(levelForXp(up.xp)).toBe(2)
  })

  it('goes through the normal level-up: bonus, notices and gifts', () => {
    const s = fresh()
    const { state, notices } = levelUp(s, T0)
    expect(state.levelSeen).toBe(2)
    expect(state.coins).toBe(s.coins + levelBonus(2))
    expect(notices.map((n) => n.kind)).toContain('level')
    // The cat arrives at level 2, as it would after a session.
    expect(GIFTS.find((g) => g.level === 2)?.animal).toBe('cat')
    expect(state.gifts).toContain('cat')
    expect(state.journal.some((e) => e.kind === 'level')).toBe(true)
  })

  it('works past the end of the level table', () => {
    const up = levelUp({ ...fresh(), xp: LEVEL_XP[19], levelSeen: 20 }, T0).state
    expect([levelForXp(up.xp), up.levelSeen]).toEqual([21, 21])
  })
})

describe('dev time skips', () => {
  // That each one makes the farm catch up as after a real absence is tested with the store, in catchup.test.ts.
  it('skips an hour, eight hours and a day', () => {
    expect(DEV_SKIPS.map((s) => s.ms)).toEqual([HOUR, 8 * HOUR, 24 * HOUR])
  })

  it.each([
    [0, 'none'],
    [HOUR, '+1 h'],
    [33 * HOUR, '+1 d 9 h'],
    [2 * 24 * HOUR + 5 * 60_000, '+2 d 5 min'],
    [30_000, '+0 min'],
  ])('reads an offset of %i ms as %s', (ms, text) => {
    expect(formatOffset(ms)).toBe(text)
  })
})

describe('the dev tools stay out of production', () => {
  // Every source file but the tests, as text.
  const sources = import.meta.glob(['/src/**/*.{ts,tsx}', '!/src/**/*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  const devImport = /(?:from\s*|import\s*\(\s*)['"]([^'"]*\/dev(?:\/[^'"]*)?)['"]/g
  const codeLines = (text: string) => text.split('\n').filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))

  it('imports the dev helpers only from the dev panel, and the panel only behind __DEV_TOOLS__, lazily', () => {
    const offenders: string[] = []
    for (const [path, text] of Object.entries(sources)) {
      if (path.startsWith('/src/dev/')) continue
      for (const line of text.split('\n')) {
        for (const match of line.matchAll(devImport)) {
          const guarded = path === '/src/App.tsx' && match[0].startsWith('import') && line.includes('__DEV_TOOLS__ ?')
          if (!guarded) offenders.push(`${path}: ${line.trim()}`)
        }
      }
    }
    expect(offenders).toEqual([])
    expect(Object.keys(sources)).toContain('/src/dev/DevPanel.tsx')
    expect(sources['/src/App.tsx']).toMatch(/__DEV_TOOLS__ \? lazy\(\(\) => import\('\.\/dev\/DevPanel'\)\) : null/)
  })

  it('has one switch, __DEV_TOOLS__, and no other build-mode check in the game', () => {
    const modeChecks: string[] = []
    const readers: string[] = []
    for (const [path, text] of Object.entries(sources)) {
      const code = codeLines(text).join('\n')
      // A `devtools` build turns __DEV_TOOLS__ on too; import.meta.env.DEV would not.
      if (/import\.meta\.env\.(?:DEV|PROD|MODE)\b/.test(code)) modeChecks.push(path)
      if (/\b__DEV_TOOLS__\b/.test(code)) readers.push(path)
    }
    expect(modeChecks).toEqual([])
    // A new reader is a decision, so it is named here.
    expect(readers.sort()).toEqual(['/src/App.tsx', '/src/dev-tools.d.ts', '/src/game/clock.ts'])
  })
})
