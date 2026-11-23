// Turns whatever was found in storage into a valid GameState. Old, partial or
// hand-edited saves are repaired field by field instead of being thrown away.
// Older saves upgrade losslessly: every newer field starts from a safe
// default, and each system repairs its own slice with `sanitize<Name>`.
// Version 3 retuned the economy (docs/superpowers/specs/2026-10-22-idle-economy-design.md
// §7): an older farm keeps everything it owns, its coins and wood, and its
// level; its producers start counting from the upgrade, and its plots count as
// fresh soil. It's told once what changed, and seeds it can't plant yet at its
// level are bought back at version 2's price (R33).

import { COMMITS, CROPS, CROP_IDS, ITEM_IDS, PLOTS, RECENT_LIMIT, TASKS, type CropId, type GiftAnimalId } from './config'
import { HISTORY_DAYS } from './core'
import { FARM_NAME_MAX, aheadAfter, isCropUnlocked, itemMax } from './engine'
import { levelForXp, xpForLevel } from './progression'
import type { Notice } from './result'
import { bool, count, field, isObj, oneOf, ownKey, text, time, xpCarry, type Raw } from './sanitize'
import {
  PET_NAME_MAX,
  SAVE_VERSION,
  createInitialState,
  emptyPlot,
  type ActiveSession,
  type DayRecord,
  type GameState,
  type Hemisphere,
  type MotionPreference,
  type Plot,
  type RewardEntry,
  type TimeOfDayPreference,
  type WatchedRepo,
  type WindowLayout,
} from './state'
import { sanitizeCharacters } from './systems/characters'
import { sanitizeCottage } from './systems/cottage'
import { sanitizeFishing } from './systems/fishing'
import { ALIAS_MAX, nextAlias, sanitizeGitEvents } from './systems/gitEvents'
import { ECONOMY_CHANGED_ID, note, sanitizeJournal } from './systems/journal'
import { sanitizeMail } from './systems/mail'
import { sanitizeRestoration } from './systems/restoration'
import { sanitizeStamps } from './systems/stamps'
import { sanitizeStudio } from './systems/studio'
import { sanitizeVisitors } from './systems/visitors'
import { sanitizeWorkshop } from './systems/workshop'
import { sanitizeYields } from './systems/yields'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

/** The version a saved farm was written by. Saves have always carried one; without it, it's the first. */
export const savedVersion = (raw: unknown): number => Math.max(1, count(field(raw, 'version'), 1))

/** Whether a farm was loaded from a newer Gitaway's save, which this version never writes over. */
export const isNewerSave = (s: Pick<GameState, 'version'>): boolean => s.version > SAVE_VERSION

/**
 * The XP versions 1 and 2 asked for each level, frozen as they were (index 0
 * is level 1): version 3 retuned the curve, and an older farm keeps the level
 * it had on its own curve.
 */
export const V2_LEVEL_XP: readonly number[] = Object.freeze([
  0, 40, 120, 260, 460, 720, 1050, 1450, 1950, 2550, 3250, 4050,
  5000, 6100, 7350, 8750, 10300, 12000, 13850, 15850,
])
/** Version 2 charged this much for each level past its table. */
export const V2_LATE_LEVEL_STEP = 2200
/** Version 1 had the first 12 levels of that table, then charged 900 XP for each level after. */
const V1_LEVEL_XP: readonly number[] = Object.freeze(V2_LEVEL_XP.slice(0, 12))
const V1_LATE_LEVEL_STEP = 900

/** The level `xp` reaches on a table of thresholds that then charges `step` for each level past it. */
function levelOnCurve(table: readonly number[], step: number, xp: number): number {
  let level = 1
  while (level < table.length && table[level] <= xp) level++
  const top = table[table.length - 1]
  return level < table.length ? level : table.length + Math.floor((xp - top) / step)
}

/** The level a farm had at this much XP in version 1. */
export const v1LevelForXp = (xp: number): number => levelOnCurve(V1_LEVEL_XP, V1_LATE_LEVEL_STEP, xp)

/** The level a farm had at this much XP in version 2. */
export const v2LevelForXp = (xp: number): number => levelOnCurve(V2_LEVEL_XP, V2_LATE_LEVEL_STEP, xp)

/**
 * What version 2 charged for each crop's seeds, frozen as it was (main's
 * `CROPS[*].seedCost` at 186b170): seeds an upgraded farm can't plant yet are
 * bought back at this price.
 */
export const V2_SEED_COST: Readonly<Record<CropId, number>> = Object.freeze({
  radish: 6, carrot: 10, wheat: 8, lettuce: 14, tomato: 20, sunflower: 28, pumpkin: 36, blueberry: 48, cranberry: 40, lavender: 44,
})

/** What a farm from before version 3 is told, once, about the economy that changed under it. */
export const ECONOMY_CHANGED = {
  id: ECONOMY_CHANGED_ID,
  title: "Gitaway's economy has changed",
  detail:
    'Work pays more now, and the farm makes things on its own: collect them from the card. Prices and crop values changed, ' +
    "some things open at later levels, land can be claimed in any order, and the grove's extra wood comes from the woodshed.",
  /** Added when seeds were bought back. */
  refund: (coins: number) => `Seeds you can't plant yet were bought back for ${coins} coins.`,
} as const

/** The XP version 2 asked for a level: its table, then V2_LATE_LEVEL_STEP for each level past it. */
export const v2XpForLevel = (level: number): number =>
  level <= 1
    ? 0
    : level <= V2_LEVEL_XP.length
      ? V2_LEVEL_XP[level - 1]
      : V2_LEVEL_XP[V2_LEVEL_XP.length - 1] + (level - V2_LEVEL_XP.length) * V2_LATE_LEVEL_STEP

/**
 * A saved plot, repaired. `fresh` clears the crop it last grew: a farm from
 * before version 3 starts with every plot counting as fresh soil (spec §7).
 */
function plotFrom(raw: unknown, id: number, fresh: boolean): Plot {
  if (!isObj(raw)) return emptyPlot(id)
  // An empty plot still remembers its last crop. Without one, or upgraded from an older version, the soil is fresh.
  const lastCrop = !fresh && ownKey(CROPS, raw.lastCrop) ? raw.lastCrop : null
  const crop = ownKey(CROPS, raw.crop) ? raw.crop : null
  const plantedAt = time(raw.plantedAt)
  const readyAt = time(raw.readyAt)
  if (!crop || plantedAt === null || readyAt === null || readyAt < plantedAt) return emptyPlot(id, lastCrop)
  return { id, crop, plantedAt, readyAt, notified: bool(raw.notified, false), lastCrop }
}

function sessionFrom(raw: unknown): ActiveSession | null {
  if (!isObj(raw)) return null
  const startedAt = time(raw.startedAt)
  if (startedAt === null) return null
  const milestones = Array.isArray(raw.milestones) ? raw.milestones.filter((m): m is number => typeof m === 'number') : []
  return { startedAt, milestones }
}

function recentFrom(raw: unknown): RewardEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(isObj)
    .map((r) => ({
      at: time(r.at) ?? 0,
      label: typeof r.label === 'string' ? r.label.slice(0, 120) : 'Reward',
      coins: count(r.coins),
      xp: count(r.xp),
      wood: count(r.wood),
    }))
    .slice(0, RECENT_LIMIT)
}

function reposFrom(raw: unknown, now: number): WatchedRepo[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const repos: WatchedRepo[] = []
  for (const r of raw.filter(isObj)) {
    if (typeof r.path !== 'string' || !r.path || seen.has(r.path) || repos.length >= COMMITS.maxRepos) continue
    seen.add(r.path)
    const cursor = count(r.cursor, Math.floor(now / 1000), 1e11)
    const alias = text(r.alias, ALIAS_MAX)
    const ahead = aheadAfter(r.ahead, cursor)
    repos.push({
      path: r.path,
      name: typeof r.name === 'string' && r.name ? r.name.slice(0, 80) : 'repository',
      cursor,
      addedAt: time(r.addedAt) ?? now,
      commits: count(r.commits),
      // Version 1 had no aliases: each repository takes the first free one, in order.
      alias: alias && !repos.some((other) => other.alias === alias) ? alias : nextAlias(repos),
      // Version 1 didn't look at tags. Its cursor is the last commit's time, possibly
      // weeks ago, so tags are looked for from the upgrade on and old ones don't replay.
      tagCursor: count(r.tagCursor, Math.floor(now / 1000), 1e11),
      ...(ahead.length ? { ahead } : {}),
    })
  }
  return repos
}

function historyFrom(raw: unknown): DayRecord[] {
  if (!Array.isArray(raw)) return []
  const days = new Set<string>()
  return raw
    .filter(isObj)
    .filter((d) => typeof d.date === 'string' && DATE_KEY.test(d.date) && !days.has(d.date) && !!days.add(d.date))
    .map((d) => ({ date: d.date as string, minutes: count(d.minutes), tasks: count(d.tasks), commits: count(d.commits), harvests: count(d.harvests) }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, HISTORY_DAYS)
}

/**
 * Tells a farm from before version 3, once, that the economy changed under it,
 * and buys back, at version 2's price, the seeds it holds for crops it can't
 * plant at its level now (some open later than they did). Mutates.
 */
function tellEconomyChanged(s: GameState, now: number, out: Notice[]): void {
  if (s.told.includes(ECONOMY_CHANGED.id)) return
  let refund = 0
  for (const id of CROP_IDS) {
    if (s.seeds[id] < 1 || isCropUnlocked(s, id)) continue
    refund += s.seeds[id] * V2_SEED_COST[id]
    s.seeds[id] = 0
  }
  s.coins += refund
  const detail = refund ? `${ECONOMY_CHANGED.detail} ${ECONOMY_CHANGED.refund(refund)}` : ECONOMY_CHANGED.detail
  note(s, out, { kind: 'info', journal: 'story', title: ECONOMY_CHANGED.title, detail }, now)
  s.told.push(ECONOMY_CHANGED.id)
}

/**
 * Returns a valid state built from raw saved data, or null if there is none.
 * What the upgrade has to tell the player goes in the journal and in `out`,
 * for the toast on the load that upgrades the farm.
 */
export function migrate(raw: unknown, now: number, out: Notice[] = []): GameState | null {
  if (!isObj(raw)) return null
  const createdAt = time(raw.createdAt) ?? now
  const base = createInitialState(createdAt)
  const s = createInitialState(createdAt)

  if (typeof raw.farmName === 'string' && raw.farmName.trim()) s.farmName = raw.farmName.trim().slice(0, FARM_NAME_MAX)
  s.coins = count(raw.coins, base.coins)
  s.wood = count(raw.wood, base.wood)
  s.xp = count(raw.xp, 0)
  // Each version's curve differs from today's, so an older farm could drop
  // levels. It keeps the level it had on its own curve instead: its XP rises
  // to that level's threshold today, a small gift and never a loss (G1).
  const version = savedVersion(raw)
  if (version < 3) s.xp = Math.max(s.xp, xpForLevel(version < 2 ? v1LevelForXp(s.xp) : v2LevelForXp(s.xp)))
  // A level only counts as celebrated once it's reached, so no bonus is skipped.
  s.levelSeen = Math.min(Math.max(1, count(raw.levelSeen, 1)), levelForXp(s.xp))

  const seeds = isObj(raw.seeds) ? raw.seeds : {}
  for (const id of CROP_IDS) s.seeds[id] = count(seeds[id], isObj(raw.seeds) ? 0 : base.seeds[id], 9999)

  const owned = isObj(raw.owned) ? raw.owned : {}
  for (const id of ITEM_IDS) s.owned[id] = count(owned[id], isObj(raw.owned) ? 0 : base.owned[id])
  // The room for some things hangs on others (the glade's beehives), so each
  // count is held to its maximum once every count is in.
  for (const id of ITEM_IDS) s.owned[id] = Math.min(s.owned[id], itemMax(s, id))
  // What's waiting is capped by the sources owned, so yields are repaired once
  // `owned` is final, restored and clamped: keep this after both.
  Object.assign(s, sanitizeYields(field(raw, 'yields'), now, s))

  // Plot count always follows the plots owned, so purchases can't be lost or duplicated.
  const plotCount = Math.min(PLOTS.max, PLOTS.starting + s.owned.plot)
  const rawPlots = Array.isArray(raw.plots) ? raw.plots : []
  s.plots = Array.from({ length: plotCount }, (_, i) => plotFrom(rawPlots[i], i, version < 3))
  // Saves from before harvests carried a fraction of a point have none, so they carry nothing.
  s.harvestXpCarry = xpCarry(raw.harvestXpCarry)

  const giftIds: GiftAnimalId[] = ['cat', 'dog']
  s.gifts = Array.isArray(raw.gifts) ? giftIds.filter((g) => (raw.gifts as unknown[]).includes(g)) : []

  s.session = sessionFrom(raw.session)

  if (isObj(raw.daily) && typeof raw.daily.date === 'string') {
    s.daily = {
      date: raw.daily.date,
      sessionMinutes: count(raw.daily.sessionMinutes),
      tasks: Array.isArray(raw.daily.tasks)
        ? raw.daily.tasks.filter((t): t is string => typeof t === 'string').slice(0, TASKS.dailyLimit)
        : [],
      commits: count(raw.daily.commits, 0, COMMITS.dailyLimit),
      harvests: count(raw.daily.harvests),
    }
  }
  s.history = historyFrom(raw.history)

  s.repos = reposFrom(raw.repos, now)
  s.recent = recentFrom(raw.recent)

  if (isObj(raw.stats)) {
    const st = raw.stats
    const harvested: Partial<Record<CropId, number>> = {}
    if (isObj(st.harvested)) for (const id of CROP_IDS) if (st.harvested[id] !== undefined) harvested[id] = count(st.harvested[id])
    s.stats = {
      sessions: count(st.sessions),
      sessionMinutes: count(st.sessionMinutes),
      tasks: count(st.tasks),
      planted: count(st.planted),
      harvested,
      coinsEarned: count(st.coinsEarned),
      commits: count(st.commits),
      visitors: count(st.visitors),
      fish: count(st.fish),
      goodsMade: count(st.goodsMade),
      crafted: count(st.crafted),
      bundles: count(st.bundles),
      photos: count(st.photos),
    }
  }

  if (isObj(raw.settings)) {
    const st = raw.settings
    const d = base.settings
    const motions: MotionPreference[] = ['auto', 'full', 'calm', 'still']
    const times: TimeOfDayPreference[] = ['clock', 'morning', 'afternoon', 'evening', 'night']
    const hemispheres: Hemisphere[] = ['north', 'south', 'off']
    const layouts: WindowLayout[] = ['normal', 'strip', 'corner']
    s.settings = {
      motion: oneOf(st.motion, motions, d.motion),
      timeOfDay: oneOf(st.timeOfDay, times, d.timeOfDay),
      ambientSound: bool(st.ambientSound, d.ambientSound),
      sessionMusic: bool(st.sessionMusic, d.sessionMusic),
      sessionPanelCollapsed: bool(st.sessionPanelCollapsed, d.sessionPanelCollapsed),
      welcomed: bool(st.welcomed, d.welcomed),
      tutorialDone: bool(st.tutorialDone, d.tutorialDone),
      quiet: bool(st.quiet, d.quiet),
      batterySaver: bool(st.batterySaver, d.batterySaver),
      hemisphere: oneOf(st.hemisphere, hemispheres, d.hemisphere),
      weather: bool(st.weather, d.weather),
      showRepoNames: bool(st.showRepoNames, d.showRepoNames),
      windowLayout: oneOf(st.windowLayout, layouts, d.windowLayout),
      keepOnTop: bool(st.keepOnTop, d.keepOnTop),
      farmOnly: bool(st.farmOnly, d.farmOnly),
    }
  }

  const names: Raw = isObj(raw.names) ? raw.names : {}
  s.names = { cat: text(names.cat, PET_NAME_MAX), dog: text(names.dog, PET_NAME_MAX), flagship: text(names.flagship, PET_NAME_MAX) }

  // Each system repairs its own slice. A v1 save has none of these, so each starts empty.
  Object.assign(
    s,
    sanitizeJournal(raw, base, now),
    // Given the farm itself, not `base`: Barnaby's ruin hangs on the highland, owned and final by now.
    sanitizeCharacters(raw, s, now),
    sanitizeVisitors(raw, base, now),
    sanitizeWorkshop(raw, base, now),
    sanitizeRestoration(raw, base, now),
    sanitizeFishing(raw, base, now),
    sanitizeMail(raw, base, now),
    sanitizeStamps(raw, base, now),
    sanitizeCottage(raw, base, now),
    sanitizeStudio(raw, base, now),
    sanitizeGitEvents(raw, base, now),
  )

  // Once the journal and everything the farm holds are in (level, land, seeds).
  if (version < 3) tellEconomyChanged(s, now, out)

  // A newer Gitaway's save keeps its version, which marks the farm as one to
  // read but never write over (see `isNewerSave`).
  s.version = Math.max(SAVE_VERSION, savedVersion(raw))
  return s
}
