import { afterEach, describe, expect, it, vi } from 'vitest'
import { COMMITS, MINUTE } from './config'
import { recordCommits, unwatchRepository, watchRepository } from './engine'
import { migrate } from './save'
import { createInitialState, type GameState } from './state'
import { withFeatures } from './testing'

const T0 = Date.UTC(2026, 9, 19, 9, 0, 0)
const DAY = 24 * 60 * MINUTE
const SEC = (ms: number) => Math.floor(ms / 1000)
const REPO = { path: 'C:\\code\\api', name: 'api' }

const watching = (): GameState => watchRepository(createInitialState(T0), REPO, T0).state
/** A report as the watcher sends it: counted since the repo's current cursor. */
const report = (s: GameState, count: number, latest: number) => ({ count, latest, since: s.repos[0].cursor })
const roundTrip = (s: GameState, at: number) => migrate(JSON.parse(JSON.stringify(s)), at)

describe('watching repositories', () => {
  it('starts counting from the moment a repository is added', () => {
    const { state, ok } = watchRepository(createInitialState(T0), REPO, T0)
    expect(ok).toBe(true)
    expect(state.repos).toEqual([{ ...REPO, cursor: SEC(T0), addedAt: T0, commits: 0, alias: 'Apple', tagCursor: SEC(T0) }])
  })

  it('refuses the same repository twice (even spelled differently) and too many repositories', () => {
    expect(watchRepository(watching(), REPO, T0).ok).toBe(false)
    expect(watchRepository(watching(), { path: 'c:/Code/API/', name: 'api' }, T0).ok).toBe(false)
    let s = createInitialState(T0)
    for (let i = 0; i < COMMITS.maxRepos; i++) s = watchRepository(s, { path: `/r/${i}`, name: `r${i}` }, T0).state
    expect(watchRepository(s, { path: '/r/extra', name: 'extra' }, T0).ok).toBe(false)
  })

  it('stops watching a repository', () => {
    expect(unwatchRepository(watching(), REPO.path).state.repos).toEqual([])
  })
})

describe('commit rewards', () => {
  it('pays for new commits and moves the cursor past them', () => {
    const s = watching()
    const latest = SEC(T0 + 30 * MINUTE)
    const { state, ok, notices } = recordCommits(s, REPO.path, report(s, 3, latest), T0 + 31 * MINUTE)
    expect(ok).toBe(true)
    expect(state.coins).toBe(createInitialState(T0).coins + 3 * COMMITS.coins)
    expect(state.xp).toBe(3 * COMMITS.xp)
    expect([state.repos[0].cursor, state.stats.commits, state.daily.commits]).toEqual([latest, 3, 3])
    expect(notices[0].title).toMatch(/3 commits/)
  })

  it('never pays twice for the same commits, nor for a report counted from an older cursor', () => {
    const s = watching()
    const r = report(s, 3, SEC(T0 + 30 * MINUTE))
    const once = recordCommits(s, REPO.path, r, T0 + 31 * MINUTE).state
    const again = recordCommits(once, REPO.path, r, T0 + 32 * MINUTE)
    expect(again.ok).toBe(false)
    expect(again.state.coins).toBe(once.coins)
    // Counted from the original cursor, so it overlaps commits already paid for.
    expect(recordCommits(once, REPO.path, { count: 2, latest: SEC(T0) + 1900, since: SEC(T0) }, T0 + 33 * MINUTE).ok).toBe(false)
  })

  it('ignores reports for repositories it is not watching, and empty reports', () => {
    const s = watching()
    expect(recordCommits(s, '/somewhere/else', report(s, 2, SEC(T0) + 60), T0).ok).toBe(false)
    expect(recordCommits(s, REPO.path, report(s, 0, SEC(T0) + 60), T0).ok).toBe(false)
  })

  it('pays up to the daily cap in one go, without banking the excess', () => {
    const s = watching()
    const big = recordCommits(s, REPO.path, report(s, 50, SEC(T0) + 600), T0 + 11 * MINUTE)
    expect(big.state.daily.commits).toBe(COMMITS.dailyLimit)
    expect(big.state.repos[0].cursor).toBe(SEC(T0) + 600)
    const capped = recordCommits(big.state, REPO.path, report(big.state, 4, SEC(T0) + 2000), T0 + 40 * MINUTE)
    expect(capped.ok).toBe(true)
    expect(capped.state.coins).toBe(big.state.coins)
    expect(capped.state.repos[0].cursor).toBe(SEC(T0) + 2000)
  })

  it('starts a fresh daily allowance the next day', () => {
    const s = recordCommits(watching(), REPO.path, report(watching(), 30, SEC(T0) + 60), T0 + 2 * MINUTE).state
    expect(recordCommits(s, REPO.path, report(s, 2, SEC(T0 + DAY)), T0 + DAY).state.daily.commits).toBe(2)
  })
})

// Fair counting (A7): a commit is counted the first time it is seen, dated ahead or not. The desktop side hands back
// the author times of those dated ahead (`ahead`) so they never count twice; a commit another folder already counted is `passed`.
describe('counting each commit once, on the day it is seen', () => {
  it('remembers commits counted ahead of their dates, through a save and load', () => {
    const s = watching()
    const latest = SEC(T0) + 60
    const r = recordCommits(s, REPO.path, { ...report(s, 2, latest), ahead: [latest + 86_400, latest + 3600] }, T0 + 2 * MINUTE)
    expect(r.state.repos[0].ahead).toEqual([latest + 3600, latest + 86_400])
    expect(roundTrip(r.state, T0 + 2 * MINUTE)?.repos[0].ahead).toEqual([latest + 3600, latest + 86_400])
  })

  it('keeps only whole times past the cursor, and nothing when there are none', () => {
    const s = watching()
    const latest = SEC(T0) + 60
    const junk = [latest, latest - 5, latest + 10.5, -1, Number.NaN, 'x', null, latest + 20, latest + 20] as unknown as number[]
    expect(recordCommits(s, REPO.path, { ...report(s, 1, latest), ahead: junk }, T0 + 2 * MINUTE).state.repos[0].ahead).toEqual([latest + 20])
    expect(recordCommits(s, REPO.path, report(s, 1, latest), T0 + 2 * MINUTE).state.repos[0]).not.toHaveProperty('ahead')
    // A save can't plant junk there either. (Its cursor is still where watching began.)
    const saved = { ...s, repos: [{ ...s.repos[0], ahead: junk }] }
    expect(roundTrip(saved, T0)?.repos[0].ahead).toEqual([latest - 5, latest, latest + 20])
    expect(roundTrip(s, T0)?.repos[0]).not.toHaveProperty('ahead')
  })

  it('moves the cursor past commits another watched folder counted, paying nothing', () => {
    const s = watching()
    const latest = SEC(T0) + 60
    const r = recordCommits(s, REPO.path, { ...report(s, 0, latest), passed: 2 }, T0 + 2 * MINUTE)
    expect(r.ok).toBe(true)
    expect(r.state.repos[0].cursor).toBe(latest)
    expect([r.state.coins, r.state.stats.commits, r.state.daily.commits, r.state.characters.shiver, r.notices]).toEqual([s.coins, 0, 0, null, []])
    expect(recordCommits(s, REPO.path, { ...report(s, 0, latest), passed: 0 }, T0 + 2 * MINUTE).ok).toBe(false)
  })

  it('credits commits to the day they are reported, whatever their dates say', () => {
    // Watched two days ago; commits dated yesterday, and one dated tomorrow, reported today.
    const watched = watchRepository(createInitialState(T0 - 2 * DAY), REPO, T0 - 2 * DAY).state
    const r = recordCommits(watched, REPO.path, report(watched, 3, SEC(T0 - DAY)), T0)
    expect(r.state.daily).toMatchObject({ date: '2026-10-19', commits: 3 })
    const ahead = recordCommits(r.state, REPO.path, { ...report(r.state, 1, SEC(T0)), ahead: [SEC(T0 + DAY)] }, T0 + MINUTE)
    expect(ahead.state.daily).toMatchObject({ date: '2026-10-19', commits: 4 })
    // So a full day stays full, however the commits are dated.
    let full = recordCommits(watched, REPO.path, report(watched, COMMITS.dailyLimit, SEC(T0 - DAY)), T0).state
    full = recordCommits(full, REPO.path, { ...report(full, 5, SEC(T0)), ahead: [SEC(T0 + DAY)] }, T0 + MINUTE).state
    expect([full.daily.commits, full.stats.commits]).toEqual([COMMITS.dailyLimit, COMMITS.dailyLimit])
  })
})

describe('repository names on screen', () => {
  const paid = (s: GameState) => recordCommits(s, REPO.path, report(s, 2, SEC(T0) + 60), T0 + 2 * MINUTE)
  const reward = `+${2 * COMMITS.coins} coins · +${2 * COMMITS.xp} XP`

  it.each([
    [true, `${reward} from the Apple tree`, '2 commits in the Apple tree'],
    [false, `${reward} from ${REPO.name}`, `2 commits in ${REPO.name}`],
  ])('with fair counting %s, rewards and recent lines read as expected', (fairCounting, detail, label) =>
    withFeatures({ fairCounting }, () => {
      const r = paid(watching())
      expect(r.notices[0]).toMatchObject({ title: '2 commits landed', detail })
      expect(r.state.recent[0].label).toBe(label)
    }),
  )
})

describe('commit times and the game clock', () => {
  // A development build can skip the game clock ahead of the device's (see clock.ts). Commits are stamped with the
  // device's time, so the cursors stay on it: the watcher passes the device's time next to the game's.
  const AHEAD = 8 * 60 * MINUTE

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('keeps paying for new commits after time is skipped, and never moves the cursor far past the device clock', () => {
    const { state } = watchRepository(createInitialState(T0), REPO, T0 + AHEAD, T0)
    expect(state.repos[0]).toMatchObject({ cursor: SEC(T0), tagCursor: SEC(T0), addedAt: T0 + AHEAD })
    const paid = recordCommits(state, REPO.path, report(state, 2, SEC(T0) + 60), T0 + AHEAD + 2 * MINUTE, T0 + 2 * MINUTE)
    expect(paid.ok).toBe(true)
    expect(paid.state.stats.commits).toBe(2)
    expect(paid.state.repos[0].cursor).toBe(SEC(T0) + 60)
    const far = recordCommits(state, REPO.path, report(state, 1, SEC(T0) + AHEAD / 1000), T0 + AHEAD + MINUTE, T0 + MINUTE)
    expect(far.state.repos[0].cursor).toBe(SEC(T0 + MINUTE) + 300)
  })

  it('is unchanged in a production build, where the game clock is the device clock', async () => {
    // Even with an offset left in storage by a development build.
    vi.stubGlobal('localStorage', { getItem: () => String(AHEAD), setItem: () => {}, removeItem: () => {} })
    vi.stubGlobal('__DEV_TOOLS__', false)
    vi.resetModules()
    const clock = await import('./clock')
    const at = clock.now()
    expect(clock.deviceTime(at)).toBe(at)
    const fresh = createInitialState(at)
    const watched = watchRepository(fresh, REPO, at, clock.deviceTime(at))
    expect(watched).toEqual(watchRepository(fresh, REPO, at))
    const s = watched.state
    const later = at + 2 * MINUTE
    expect(recordCommits(s, REPO.path, report(s, 2, SEC(at) + 60), later, clock.deviceTime(later))).toEqual(recordCommits(s, REPO.path, report(s, 2, SEC(at) + 60), later))
  })
})
