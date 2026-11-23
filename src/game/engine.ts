// Pure game rules. Every action takes the current state plus the current time
// and returns a new state with any notices to show. Nothing here touches the
// DOM, timers or storage, so it is deterministic and unit-tested. Notices go
// through the journal's `note`, which also writes them down.

import {
  BONUS,
  COMMITS,
  CROPS,
  GLADE_HIVES,
  GROW_MINUTES_PER_XP,
  ITEMS,
  ITEM_IDS,
  LAND,
  MINUTE,
  PLOTS,
  PRICING,
  SESSION,
  TASKS,
  startingCount,
  type CropId,
  type ItemId,
} from './config'
import { bundlesNeeded, cropAvailable, itemAvailable } from './available'
import { addRecent, carryXp, clone, grantCoins, grantXp, plural, refuse, rollDay, farmPay } from './core'
import { FIELD, earnedAll } from './fairCounting'
import { isOn } from './features'
import { levelForXp } from './progression'
import type { Notice, Result } from './result'
import { emptyPlot, localDateKey, type GameState, type Plot, type Settings } from './state'
import { nextAlias, repoLabel } from './systems/gitEvents'
import { builtStory, firstStory, note } from './systems/journal'
import { bundlesDone, isRestored } from './systems/restoration'
import { isLiveCommit, shiver } from './systems/shiver'
import { settleYields } from './systems/yields'

export type { Notice, NoticeKind, Result } from './result'

// ---------------------------------------------------------------------------
// Work sessions

export function startSession(state: GameState, now: number): Result {
  if (state.session || state.settings.farmOnly) return refuse(state)
  const s = clone(state)
  rollDay(s, now)
  s.session = { startedAt: now, milestones: [] }
  const notices: Notice[] = []
  if (s.daily.sessionMinutes >= SESSION.dailyMinuteCap) {
    // Fair counting (A7) tells a reached cap as a full field.
    const words = isOn('fairCounting')
      ? { title: FIELD.full, detail: `This session is for the joy of it. ${FIELD.fresh}` }
      : { title: 'Session started', detail: "You've reached today's reward cap, so this one is just for the joy of it." }
    note(s, notices, { kind: 'info', ...words }, now)
  }
  return { state: s, notices, ok: true }
}

export type SessionCap = 'session' | 'daily' | null

export interface SessionPreview {
  elapsedMs: number
  creditedMinutes: number
  coins: number
  xp: number
  wood: number
  cap: SessionCap
  clockSkew: boolean
}

/** What ending the active session right now would pay out. */
export function sessionPreview(state: GameState, now: number): SessionPreview {
  const none: SessionPreview = { elapsedMs: 0, creditedMinutes: 0, coins: 0, xp: 0, wood: 0, cap: null, clockSkew: false }
  if (!state.session) return none
  const elapsedMs = now - state.session.startedAt
  if (elapsedMs < 0) return { ...none, clockSkew: true }

  const minutes = Math.floor(elapsedMs / MINUTE)
  const usedToday = state.daily.date === localDateKey(now) ? state.daily.sessionMinutes : 0
  const dailyLeft = Math.max(0, SESSION.dailyMinuteCap - usedToday)

  let credited = Math.min(minutes, SESSION.maxMinutes)
  let cap: SessionCap = minutes >= SESSION.maxMinutes ? 'session' : null
  if (credited > dailyLeft) {
    credited = dailyLeft
    cap = 'daily'
  }
  if (credited < SESSION.minMinutes) credited = 0

  return {
    elapsedMs,
    creditedMinutes: credited,
    coins: credited * SESSION.coinsPerMinute,
    xp: credited * SESSION.xpPerMinute,
    wood: Math.floor(credited / SESSION.minutesPerWood),
    cap,
    clockSkew: false,
  }
}

export function endSession(state: GameState, now: number): Result {
  if (!state.session) return refuse(state)
  const preview = sessionPreview(state, now)
  const s = clone(state)
  rollDay(s, now)
  s.session = null
  const notices: Notice[] = []

  if (preview.clockSkew) {
    note(s, notices, {
      kind: 'warn',
      title: 'Session not counted',
      detail: 'Your clock seems to have jumped backwards, so this session could not be measured.',
    }, now)
    return { state: s, notices, ok: true }
  }

  if (preview.creditedMinutes === 0) {
    if (preview.cap === 'daily' && isOn('fairCounting')) {
      note(s, notices, { kind: 'info', title: FIELD.full, detail: `This session was for the joy of it. ${FIELD.fresh}` }, now)
      return { state: s, notices, ok: true }
    }
    const reason =
      preview.cap === 'daily'
        ? "You've already reached today's reward cap. The farm can wait. Rest up."
        : 'Sessions shorter than a minute do not earn coins.'
    note(s, notices, { kind: 'info', title: 'Session ended', detail: reason }, now)
    return { state: s, notices, ok: true }
  }

  const { creditedMinutes: minutes, coins, xp, wood } = preview
  const first = s.stats.sessions === 0
  s.daily.sessionMinutes += minutes
  s.stats.sessions++
  s.stats.sessionMinutes += minutes
  grantCoins(s, coins)
  s.wood += wood
  const label = `Work session · ${formatMinutes(minutes)}`
  addRecent(s, { at: now, label, coins, xp, wood })
  const parts = [`+${coins} coins`, `+${xp} XP`]
  if (wood) parts.push(`+${wood} wood`)
  note(s, notices, { kind: 'session', title: 'Session complete', detail: parts.join(' · '), entry: { title: label, detail: parts.join(' · ') } }, now)
  if (first) firstStory(s, 'session', now)
  grantXp(s, xp, notices, now)
  shiver(s, 'big', now, notices)
  return { state: s, notices, ok: true }
}

const MILESTONE_NOTES: Record<number, [string, string]> = {
  25: ['25 minutes of focus', "That's one tomato's worth. Nice."],
  60: ['An hour in', 'The chickens are quietly impressed.'],
  120: ['Two hours of focus', 'Maybe stretch your legs for a minute?'],
  180: ['Three hours', 'A glass of water would not hurt.'],
  240: ['Four hours: rewards paused', 'This session has earned all it can. Take a proper break.'],
}

/** Announces the latest session milestone passed, once. A passing nudge, so it isn't journaled. */
export function checkSessionMilestones(state: GameState, now: number): Result {
  if (!state.session) return refuse(state)
  const minutes = Math.floor((now - state.session.startedAt) / MINUTE)
  const passed = SESSION.milestones.filter((m) => minutes >= m && !state.session!.milestones.includes(m))
  if (!passed.length) return refuse(state)
  const s = clone(state)
  s.session!.milestones.push(...passed)
  const latest = passed[passed.length - 1]
  const [title, detail] = MILESTONE_NOTES[latest] ?? [`${latest} minutes`, 'Keep it gentle.']
  const notices: Notice[] = []
  note(s, notices, { kind: 'session', title, detail, journal: false }, now)
  return { state: s, notices, ok: true }
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}

// ---------------------------------------------------------------------------
// Tasks

export function normaliseTask(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function logTask(state: GameState, title: string, now: number): Result {
  if (state.settings.farmOnly) return refuse(state)
  const clean = title.trim().replace(/\s+/g, ' ').slice(0, TASKS.maxTitleLength)
  const key = normaliseTask(clean)
  if (!key) return refuse(state, { kind: 'warn', title: 'Name the task first', detail: 'A few words is plenty.' })

  const s = clone(state)
  rollDay(s, now)
  if (s.daily.tasks.includes(key)) {
    return refuse(state, { kind: 'warn', title: 'Already logged today', detail: 'Each task earns a reward once a day.' })
  }
  if (s.daily.tasks.length >= TASKS.dailyLimit) {
    if (isOn('fairCounting')) return refuse(state, { kind: 'info', title: FIELD.full, detail: `${earnedAll(['tasks'])} ${FIELD.fresh}` })
    return refuse(state, {
      kind: 'info',
      title: "That's today's task rewards",
      detail: `The first ${TASKS.dailyLimit} tasks each day earn a bonus. Well done.`,
    })
  }

  const first = s.stats.tasks === 0
  s.daily.tasks.push(key)
  s.stats.tasks++
  grantCoins(s, TASKS.coins)
  s.wood += TASKS.wood
  addRecent(s, { at: now, label: clean, coins: TASKS.coins, xp: TASKS.xp, wood: TASKS.wood })
  const reward = `+${TASKS.coins} coins · +${TASKS.xp} XP · +${TASKS.wood} wood`
  const notices: Notice[] = []
  note(s, notices, { kind: 'reward', title: 'Task logged', detail: reward, entry: { title: clean, detail: reward } }, now)
  if (first) firstStory(s, 'task', now)
  grantXp(s, TASKS.xp, notices, now)
  shiver(s, 'small', now, notices)
  return { state: s, notices, ok: true }
}

// ---------------------------------------------------------------------------
// Commits (desktop app only)
//
// Only numbers ever reach the game: how many of your own commits are newer
// than the last ones counted, and when the newest was made.

export interface CommitReport {
  count: number
  /** Commit time (Unix seconds) of the newest commit in the report, never later than the device's clock. */
  latest: number
  /** The cursor the report was counted from; anything else is out of date. */
  since: number
  /**
   * Author times of commits counted ahead of their dates, which the desktop
   * side wants handed back next time (see WatchedRepo.ahead). Absent from
   * older desktop apps.
   */
  ahead?: number[]
  /** Commits passed over because another watched folder counted them; the cursor still moves past them. */
  passed?: number
}

/** The most remembered times a repository keeps (the desktop side's AHEAD_MAX). */
export const AHEAD_MAX = 512

/** Remembered author times worth keeping: whole Unix seconds past the cursor, in order, once each. */
export function aheadAfter(raw: unknown, cursor: number): number[] {
  if (!Array.isArray(raw)) return []
  const times = raw.filter((t): t is number => Number.isInteger(t) && t > cursor && t <= 1e11)
  return [...new Set(times)].sort((a, b) => a - b).slice(0, AHEAD_MAX)
}

/** Paths compare without regard to case, slash direction or a trailing slash (Windows). */
const samePath = (a: string, b: string) => {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  return norm(a) === norm(b)
}

/** How far ahead of the clock a cursor may sit, for small clock differences. */
const CLOCK_SLACK_SECONDS = 300

// The commit functions take the game's time, `now`, and the device's,
// `realNow`, which commit times are compared with. The two differ only after a
// development build has skipped time (see clock.ts); the cursors stay on the
// device's clock, so a skip can't leave new commits looking older than them.

export function watchRepository(state: GameState, repo: { path: string; name: string }, now: number, realNow = now): Result {
  if (!repo.path || state.repos.some((r) => samePath(r.path, repo.path))) {
    return refuse(state, { kind: 'info', title: 'Already watching that repository' })
  }
  if (state.repos.length >= COMMITS.maxRepos) {
    return refuse(state, { kind: 'warn', title: 'That is plenty of repositories', detail: `Gitaway watches up to ${COMMITS.maxRepos}.` })
  }
  const s = clone(state)
  // Counting starts now: history from before you connected doesn't pay out.
  const cursor = Math.floor(realNow / 1000)
  const watched = { path: repo.path, name: repo.name, cursor, addedAt: now, commits: 0, alias: nextAlias(s.repos), tagCursor: cursor }
  s.repos.push(watched)
  const notices: Notice[] = []
  // The journal is kept for good, so it names the repository by its alias unless the player chose otherwise.
  note(s, notices, {
    kind: 'info',
    journal: 'git',
    title: `Watching ${repo.name}`,
    detail: 'New commits you make there will earn coins.',
    entry: { title: `Watching a new repository: ${repoLabel(s, watched)}` },
  }, now)
  return { state: s, notices, ok: true }
}

export function unwatchRepository(state: GameState, path: string): Result {
  if (!state.repos.some((r) => r.path === path)) return refuse(state)
  const s = clone(state)
  s.repos = s.repos.filter((r) => r.path !== path)
  return { state: s, notices: [], ok: true }
}

export function recordCommits(state: GameState, path: string, report: CommitReport, now: number, realNow = now): Result {
  const watched = state.repos.find((r) => r.path === path)
  // Commits another watched folder counted still move this one's cursor on.
  const anything = report.count >= 1 || (report.passed ?? 0) >= 1
  if (!watched || report.since !== watched.cursor || !anything || !(report.latest > watched.cursor)) return refuse(state)

  const s = clone(state)
  // Commits count on the day they're reported, whatever their dates say.
  rollDay(s, now)
  const repo = s.repos.find((r) => r.path === path)!
  // The cursor always moves on, so commits over the cap are not saved up for
  // later. A commit stamped in the future can't park it there either.
  repo.cursor = Math.min(Math.floor(report.latest), Math.floor(realNow / 1000) + CLOCK_SLACK_SECONDS)
  // Commits counted ahead of their dates are remembered, so they never count again.
  const ahead = aheadAfter(report.ahead, repo.cursor)
  if (ahead.length) repo.ahead = ahead
  else delete repo.ahead
  // With farm-only on, the cursor still moves, so these commits aren't paid later either.
  const credited = s.settings.farmOnly ? 0 : Math.min(Math.floor(report.count), Math.max(0, COMMITS.dailyLimit - s.daily.commits))
  if (credited < 1) return { state: s, notices: [], ok: true }

  const first = s.stats.commits === 0
  const coins = credited * COMMITS.coins
  const xp = credited * COMMITS.xp
  s.daily.commits += credited
  s.stats.commits += credited
  repo.commits += credited
  grantCoins(s, coins)
  const landed = `${plural(credited, 'commit', 'commits')} landed`
  // With fair counting (A7, guardrail G7) the reward on screen names the repository by its alias too, as the journal does.
  const onScreen = isOn('fairCounting') ? repoLabel(s, repo) : repo.name
  addRecent(s, { at: now, label: `${plural(credited, 'commit', 'commits')} in ${onScreen}`, coins, xp, wood: 0 })
  const notices: Notice[] = []
  note(s, notices, {
    kind: 'reward',
    title: landed,
    detail: `+${coins} coins · +${xp} XP from ${onScreen}`,
    entry: { title: landed, detail: `+${coins} coins · +${xp} XP from ${repoLabel(s, repo)}` },
  }, now)
  if (first) firstStory(s, 'commit', now)
  grantXp(s, xp, notices, now)
  // Commits found on catching up after time away don't shiver: only work done while the game is open.
  if (isLiveCommit(report.latest, realNow)) shiver(s, 'small', now, notices)
  return { state: s, notices, ok: true }
}

// ---------------------------------------------------------------------------
// Garden

export function isCropUnlocked(state: GameState, crop: CropId): boolean {
  const def = CROPS[crop]
  return cropAvailable(crop) && levelForXp(state.xp) >= def.unlockLevel && (!def.requires || state.owned[def.requires] > 0)
}

/** Growth from 0 to 1 for a planted plot. */
export function cropProgress(plot: Plot, now: number): number {
  if (!plot.crop || plot.plantedAt === null || plot.readyAt === null) return 0
  const span = plot.readyAt - plot.plantedAt
  if (span <= 0) return 1
  return Math.min(1, Math.max(0, (now - plot.plantedAt) / span))
}

export function isReady(plot: Plot, now: number): boolean {
  return plot.crop !== null && plot.readyAt !== null && now >= plot.readyAt
}

export function growMs(state: GameState, crop: CropId): number {
  const factor = state.owned.greenhouse > 0 ? 1 - BONUS.greenhouseGrowth : 1
  return Math.round(CROPS[crop].growMinutes * MINUTE * factor)
}

/** Whether the crop would grow in fresh soil: anything but what the plot last grew, or anything at all in a plot that never grew one. */
export const isFresh = (plot: Plot, crop: CropId): boolean => plot.lastCrop !== crop

/**
 * What a harvest of the crop sells for. Fresh soil and the windmill each add
 * their share on top of the other, so each pays what it says whether or not
 * the other is there.
 */
export function harvestValue(state: GameState, crop: CropId, fresh = false): number {
  const windmill = state.owned.windmill > 0 ? 1 + BONUS.windmillHarvest : 1
  const soil = fresh ? 1 + BONUS.freshSoil : 1
  return Math.round(CROPS[crop].coins * windmill * soil * farmPay(state))
}

/**
 * The XP a harvest of the crop earns: a point for every GROW_MINUTES_PER_XP
 * minutes it grows, up to the crop's own `xp`. A short crop earns a fraction
 * of a point, carried in `harvestXpCarry` until it makes a whole one.
 */
export const cropXp = (crop: CropId): number => Math.min(CROPS[crop].xp, CROPS[crop].growMinutes / GROW_MINUTES_PER_XP)

export function buySeeds(state: GameState, crop: CropId, quantity: number, now: number): Result {
  const def = CROPS[crop]
  const qty = Math.floor(quantity)
  // A crop of a switched-off feature isn't in the game yet, so there's nothing to explain.
  if (!def || !cropAvailable(crop) || qty < 1 || qty > 99) return refuse(state)
  if (!isCropUnlocked(state, crop)) {
    const detail =
      levelForXp(state.xp) < def.unlockLevel
        ? `Reach farm level ${def.unlockLevel} first.`
        : `It needs the ${ITEMS[def.requires!].name.toLowerCase()} first.`
    return refuse(state, { kind: 'warn', title: `${def.name} is still locked`, detail })
  }
  const cost = def.seedCost * qty
  if (state.coins < cost) {
    return refuse(state, { kind: 'warn', title: 'Not enough coins', detail: `${plural(qty, 'packet', 'packets')} cost ${cost} coins.` })
  }
  const s = clone(state)
  s.coins -= cost
  s.seeds[crop] += qty
  const notices: Notice[] = []
  note(s, notices, { kind: 'info', title: `Bought ${def.name.toLowerCase()} seeds`, detail: `${plural(qty, 'packet', 'packets')} for ${cost} coins.` }, now)
  return { state: s, notices, ok: true }
}

function plantInto(s: GameState, plot: Plot, crop: CropId, now: number) {
  plot.crop = crop
  plot.plantedAt = now
  plot.readyAt = now + growMs(s, crop)
  plot.notified = false
  s.seeds[crop]--
  s.stats.planted++
}

export function plant(state: GameState, plotId: number, crop: CropId, now: number): Result {
  const target = state.plots.find((p) => p.id === plotId)
  if (!target || target.crop) return refuse(state)
  if (!isCropUnlocked(state, crop)) return refuse(state)
  if (state.seeds[crop] < 1) {
    return refuse(state, { kind: 'warn', title: `No ${CROPS[crop].name.toLowerCase()} seeds`, detail: 'Pick some up in the shop.' })
  }
  const s = clone(state)
  plantInto(s, s.plots.find((p) => p.id === plotId)!, crop, now)
  return { state: s, notices: [], ok: true }
}

/** Plants the crop in every empty plot while seeds last. */
export function plantAll(state: GameState, crop: CropId, now: number): Result {
  const empty = state.plots.filter((p) => !p.crop)
  if (!empty.length || state.seeds[crop] < 1 || !isCropUnlocked(state, crop)) return refuse(state)
  const s = clone(state)
  let count = 0
  for (const plot of s.plots) {
    if (plot.crop || s.seeds[crop] < 1) continue
    plantInto(s, plot, crop, now)
    count++
  }
  const notices: Notice[] = []
  note(s, notices, { kind: 'info', journal: 'garden', title: `Planted ${plural(count, CROPS[crop].name.toLowerCase(), CROPS[crop].plural)}` }, now)
  return { state: s, notices, ok: true }
}

/** Empties a ripe plot, remembering what it grew, and pays its coins. Its XP is granted by the caller, after the harvest is noted. */
function harvestInto(
  s: GameState,
  plot: Plot,
): {
  coins: number
  /** Often a fraction of a point: it must go through `payHarvestXp` before `grantXp`, which would round it. */
  xpExact: number
} {
  const crop = plot.crop!
  const coins = harvestValue(s, crop, isFresh(plot, crop))
  grantCoins(s, coins)
  s.stats.harvested[crop] = (s.stats.harvested[crop] ?? 0) + 1
  s.daily.harvests++
  Object.assign(plot, emptyPlot(plot.id, crop))
  return { coins, xpExact: cropXp(crop) * farmPay(s) }
}

const totalHarvested = (s: GameState) => Object.values(s.stats.harvested).reduce((a, b) => a + (b ?? 0), 0)

/** Adds a harvest's XP to the fraction harvests have carried, and returns the whole points to grant now. Mutates. */
function payHarvestXp(s: GameState, xp: number): number {
  const { whole, carry } = carryXp(s.harvestXpCarry, xp)
  s.harvestXpCarry = carry
  return whole
}

/** What a harvest paid, in words: only whole points of XP, and nothing about XP when it paid none. */
const harvestPaid = (coins: number, xp: number) => (xp ? `+${coins} coins · +${xp} XP` : `+${coins} coins`)

export function harvest(state: GameState, plotId: number, now: number): Result {
  const target = state.plots.find((p) => p.id === plotId)
  if (!target || !isReady(target, now)) return refuse(state)
  const s = clone(state)
  rollDay(s, now)
  const crop = target.crop!
  const first = totalHarvested(s) === 0
  const { coins, xpExact } = harvestInto(s, s.plots.find((p) => p.id === plotId)!)
  const xp = payHarvestXp(s, xpExact)
  addRecent(s, { at: now, label: `Harvested ${CROPS[crop].name.toLowerCase()}`, coins, xp, wood: 0 })
  const notices: Notice[] = []
  note(s, notices, { kind: 'crop', title: `Harvested ${CROPS[crop].name.toLowerCase()}`, detail: harvestPaid(coins, xp) }, now)
  if (first) firstStory(s, 'harvest', now)
  grantXp(s, xp, notices, now)
  return { state: s, notices, ok: true }
}

export function harvestAll(state: GameState, now: number): Result {
  const ready = state.plots.filter((p) => isReady(p, now))
  if (!ready.length) return refuse(state)
  const s = clone(state)
  rollDay(s, now)
  const first = totalHarvested(s) === 0
  let coins = 0
  let xpExact = 0
  for (const plot of s.plots) {
    if (!isReady(plot, now)) continue
    const paid = harvestInto(s, plot)
    coins += paid.coins
    xpExact += paid.xpExact
  }
  const xp = payHarvestXp(s, xpExact)
  const title = `Harvested ${plural(ready.length, 'crop', 'crops')}`
  addRecent(s, { at: now, label: title, coins, xp, wood: 0 })
  const notices: Notice[] = []
  note(s, notices, { kind: 'crop', title, detail: harvestPaid(coins, xp) }, now)
  if (first) firstStory(s, 'harvest', now)
  grantXp(s, xp, notices, now)
  return { state: s, notices, ok: true }
}

// ---------------------------------------------------------------------------
// Building and buying

const LAND_IDS = ITEM_IDS.filter((id) => ITEMS[id].category === 'land')

/** How many pieces of land the farm has claimed. */
export const landOwned = (state: GameState): number => LAND_IDS.reduce((n, id) => n + state.owned[id], 0)

/** How many of a thing the farm has room for: the glade's wildflowers make room for more beehives. */
export const itemMax = (state: GameState, id: ItemId): number =>
  ITEMS[id].max + (id === 'beehive' && state.owned.cottageLand ? GLADE_HIVES : 0)

/**
 * The price of the next one. Every piece of land not yet owned costs the
 * same, more for each piece already claimed (LAND). Repeatable things (except
 * plots, which have their own steps) cost 12% more for each one beyond those
 * you started with.
 */
export function itemPrice(state: GameState, id: ItemId): { coins: number; wood: number } {
  const def = ITEMS[id]
  if (def.category === 'land') {
    const owned = landOwned(state)
    return {
      coins: Math.round(LAND.coins.base * LAND.coins.growth ** owned),
      wood: Math.round(LAND.wood.base * LAND.wood.growth ** owned),
    }
  }
  if (id === 'plot') return { coins: PLOTS.baseCost + PLOTS.costStep * state.owned.plot, wood: 0 }
  if (def.max <= 1) return { coins: def.coins, wood: def.wood }
  const factor = PRICING.repeatGrowth ** Math.max(0, state.owned[id] - startingCount(id))
  return { coins: Math.round(def.coins * factor), wood: Math.round(def.wood * factor) }
}

export type BuyBlock = 'workbench' | 'level' | 'requires' | 'bundles' | 'max' | 'coins' | 'wood' | null

export function buyBlock(state: GameState, id: ItemId): BuyBlock {
  const def = ITEMS[id]
  if (def.source === 'workbench') return 'workbench'
  if (levelForXp(state.xp) < def.unlockLevel) return 'level'
  if (def.requires && state.owned[def.requires] < 1) return 'requires'
  // Restorations are only waited on while they're switched on (see available.ts).
  if (bundlesDone(state) < bundlesNeeded(id) || (def.requiresBundle && !isRestored(state, def.requiresBundle))) {
    return 'bundles'
  }
  if (state.owned[id] >= itemMax(state, id)) return 'max'
  const price = itemPrice(state, id)
  if (state.coins < price.coins) return 'coins'
  if (state.wood < price.wood) return 'wood'
  return null
}

/** Why something can't be bought, in a sentence. */
export function buyBlockReason(id: ItemId, block: Exclude<BuyBlock, null>): string {
  const def = ITEMS[id]
  const reasons: Record<Exclude<BuyBlock, null>, string> = {
    workbench: 'It is made from wood at the workbench, not bought.',
    level: `Unlocks at farm level ${def.unlockLevel}.`,
    requires: `Needs the ${def.requires ? ITEMS[def.requires].name.toLowerCase() : ''} first.`,
    bundles: def.requiresBundles
      ? `Opens once ${plural(def.requiresBundles, 'restoration is', 'restorations are')} finished.`
      : 'Opens once a restoration is finished.',
    max: 'There is no room for another one.',
    coins: 'Not enough coins yet.',
    wood: 'Not enough wood yet.',
  }
  return reasons[block]
}

const BUILT_NOTES: Partial<Record<ItemId, string>> = {
  plot: 'Fresh soil, ready for seeds.',
  windmill: 'Harvests now earn 10% more coins.',
  greenhouse: 'New crops will grow 20% faster.',
  meadow: 'The meadow rises from the clouds and settles in beside the farm.',
  grove: 'Its trees give a woodshed more wood to stack.',
  islet: 'The islet rises from the clouds and joins the island.',
  lighthouse: 'Its light sweeps the cloud sea at night.',
  chicken: 'Another chicken joins the flock.',
  duck: 'A duck paddles onto the pond.',
  sheep: 'A sheep trots over to the meadow.',
  goat: 'A goat picks its way up onto the highland terrace.',
  wetland: "The wetland rises from the clouds and docks beside the farm. The farm's stream runs on into its lake.",
  highland: 'The highland rises from the clouds and docks behind the farm, its moor high above the garden.',
  // Land comes in any order and the windmill only stands once built, so each piece is placed by the farm alone.
  cottageLand: 'The glade rises from the clouds and docks at the edge of the farm.',
  orchardLand: 'The orchard rises from the clouds and docks behind the farm.',
}

export function buyItem(state: GameState, id: ItemId, now: number): Result {
  const def = ITEMS[id]
  // Neither is a thing of a switched-off feature.
  if (!def || !itemAvailable(id)) return refuse(state)
  const block = buyBlock(state, id)
  if (block) return refuse(state, { kind: 'warn', title: `Can't add ${def.name.toLowerCase()} yet`, detail: buyBlockReason(id, block) })
  const price = itemPrice(state, id)
  const s = clone(state)
  const first = s.owned[id] === 0
  s.coins -= price.coins
  s.wood -= price.wood
  // What's waiting is banked at the old count, so a new source never changes what was made before it.
  settleYields(s, now)
  s.owned[id]++
  if (id === 'plot') {
    const nextId = Math.max(-1, ...s.plots.map((p) => p.id)) + 1
    s.plots.push(emptyPlot(nextId))
  }
  const notices: Notice[] = []
  note(s, notices, {
    kind: def.category === 'animal' ? 'animal' : 'info',
    journal: 'build',
    title: `${def.name} added`,
    detail: BUILT_NOTES[id] ?? def.blurb,
  }, now)
  if (first) builtStory(s, id, now)
  grantXp(s, def.xp, notices, now)
  return { state: s, notices, ok: true }
}

// ---------------------------------------------------------------------------
// Farm and settings

export const FARM_NAME_MAX = 32

export function renameFarm(state: GameState, name: string): Result {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, FARM_NAME_MAX)
  if (!clean || clean === state.farmName) return refuse(state)
  const s = clone(state)
  s.farmName = clean
  return { state: s, notices: [], ok: true }
}

export function updateSettings(state: GameState, patch: Partial<Settings>): Result {
  const s = clone(state)
  s.settings = { ...s.settings, ...patch }
  return { state: s, notices: [], ok: true }
}

/** Total animals living on the island, bought and gifted. */
export function animalCount(state: GameState): number {
  return state.owned.chicken + state.owned.duck + state.owned.sheep + state.owned.goat + state.gifts.length
}
