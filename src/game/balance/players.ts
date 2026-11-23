// The simulated players of the balance report (spec §2): when they work, when
// they look in on the farm, and a log of every day they play. They play the
// game's real rules from a new farm, so the report can't drift from the game.

import { MINUTE, type CropId, type ItemId } from '../config'
import { endSession, logTask, startSession } from '../engine'
import { levelForXp, unlocksAtLevel } from '../progression'
import { createInitialState, type GameState, type Settings } from '../state'
import { checkIn, earn } from './strategy'

export type PlayerKind = 'worker' | 'farmer' | 'light'

export interface PlayerProfile {
  kind: PlayerKind
  /** When they look in on the farm, in hours after local midnight. */
  checkIns: number[]
  /** The days of the week they work: 1–5 are Monday to Friday. */
  workdays: number[]
  /** A workday's one session, from 09:00. */
  sessionMinutes: number
  /** Tasks logged at 12:00 on a workday. */
  tasks: number
}

export const PROFILES: Record<PlayerKind, PlayerProfile> = {
  worker: { kind: 'worker', checkIns: [9, 13, 18], workdays: [1, 2, 3, 4, 5], sessionMinutes: 120, tasks: 4 },
  farmer: { kind: 'farmer', checkIns: [9, 13, 18], workdays: [], sessionMinutes: 0, tasks: 0 },
  light: { kind: 'light', checkIns: [18], workdays: [1, 2, 3, 4, 5], sessionMinutes: 120, tasks: 4 },
}

export type Tally = { coins: number; wood: number; xp: number }

export interface DayLog {
  /** Day 1 is the first, a Monday. */
  day: number
  /** The level at the end of the day. */
  level: number
  /** Everything bought that day, in order. */
  bought: ItemId[]
  /** The crops, items and gift animals that the day's level-ups unlocked. */
  unlocked: string[]
  /** Coins and wood at the end of the day. */
  coins: number
  wood: number
  /** Harvest coins, by crop: what each harvested plot paid, fresh soil counted. */
  harvest: Partial<Record<CropId, number>>
  /** Harvests whose crops' coins didn't add up to what the harvest paid. Empty unless the tally is wrong. */
  mismatches: string[]
  /**
   * What the day's work calls earned, and what its harvests and collecting
   * brought in before seeds, level-up bonuses with the call that reached the
   * level. Purchase XP is neither.
   */
  earned: { work: Tally; farm: Tally }
  /** Coins spent on seeds: the farm's running cost, which work doesn't have. */
  seeds: number
}

export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR
/** Monday 2026-10-19, 00:00. The simulator runs with TZ=UTC. */
export const T0 = Date.UTC(2026, 9, 19)

/** The day of the week of a played day: 0 is Sunday, 1–5 are Monday to Friday, 6 is Saturday. Day 1 is a Monday. */
export const weekday = (day: number) => new Date(T0 + (day - 1) * DAY).getDay()

/** When a workday's session starts, and when its tasks are logged. */
const SESSION_START = 9
const TASKS_AT = 12

export function play(profile: PlayerProfile, days: number, settings: Partial<Settings> = {}): DayLog[] {
  let s = createInitialState(T0)
  s.settings = { ...s.settings, ...settings }
  const logs: DayLog[] = []
  const { checkIns } = profile
  for (let d = 0; d < days; d++) {
    const midnight = T0 + d * DAY
    const at = (hours: number) => midnight + hours * HOUR
    const log: DayLog = {
      day: d + 1,
      level: 0,
      bought: [],
      unlocked: [],
      coins: 0,
      wood: 0,
      harvest: {},
      mismatches: [],
      earned: { work: { coins: 0, wood: 0, xp: 0 }, farm: { coins: 0, wood: 0, xp: 0 } },
      seeds: 0,
    }
    const levelBefore = levelForXp(s.xp)
    const work = (next: GameState) => {
      earn(log.earned.work, s, next)
      s = next
    }

    // The day in time order. Sorting is stable, so a check-in comes before work that starts at the same time.
    const events: [at: number, run: () => void][] = checkIns.map((hour, i) => {
      const next = i + 1 < checkIns.length ? checkIns[i + 1] : checkIns[0] + 24
      return [at(hour), () => (s = checkIn(s, at(hour), (next - hour) * HOUR, log))]
    })
    if (profile.workdays.includes(weekday(log.day))) {
      const start = at(SESSION_START)
      const end = start + profile.sessionMinutes * MINUTE
      events.push(
        [start, () => work(startSession(s, start).state)],
        [end, () => work(endSession(s, end).state)],
        [at(TASKS_AT), () => {
          for (let t = 1; t <= profile.tasks; t++) work(logTask(s, `Task ${t} of day ${d + 1}`, at(TASKS_AT)).state)
        }],
      )
    }
    events.sort((a, b) => a[0] - b[0])
    for (const [, run] of events) run()

    log.level = levelForXp(s.xp)
    for (let level = levelBefore + 1; level <= log.level; level++) {
      const opened = unlocksAtLevel(level)
      log.unlocked.push(...opened.crops.map((c) => c.id), ...opened.items.map((i) => i.id), ...opened.gifts.map((g) => g.animal))
    }
    log.coins = s.coins
    log.wood = s.wood
    logs.push(log)
  }
  return logs
}
