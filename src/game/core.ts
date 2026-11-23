// Building blocks the game's actions share: the daily ledger, coins, XP and
// the recent-rewards list. Pure, like the rules that use them. Systems import
// these from here rather than from the engine, so nothing imports in circles.

import { RECENT_LIMIT, levelBonus, FARM_ONLY } from './config'
import { levelForXp, levelTitle, unlocksAtLevel } from './progression'
import type { Notice } from './result'
import { localDateKey, type DailyLedger, type GameState, type RewardEntry } from './state'
import { note, tellLadder } from './systems/journal'

export { clone, plural, refuse, type Notice, type NoticeKind, type Result } from './result'

/** Finished days kept for the postcard. */
export const HISTORY_DAYS = 14

export function emptyLedger(date: string): DailyLedger {
  return { date, sessionMinutes: 0, tasks: [], commits: 0, harvests: 0 }
}

/** Starts a new daily ledger when the local date has changed, keeping the finished day in `history`. */
export function rollDay(s: GameState, now: number): boolean {
  const today = localDateKey(now)
  if (s.daily.date === today) return false
  const d = s.daily
  const record = { date: d.date, minutes: d.sessionMinutes, tasks: d.tasks.length, commits: d.commits, harvests: d.harvests }
  s.history = [record, ...s.history.filter((h) => h.date !== d.date)].slice(0, HISTORY_DAYS)
  s.daily = emptyLedger(today)
  return true
}

export function addRecent(s: GameState, entry: RewardEntry) {
  s.recent = [entry, ...s.recent].slice(0, RECENT_LIMIT)
}

/** What the farm's own output is multiplied by: FARM_ONLY.pay with the farm-only setting on. */
export const farmPay = (s: Pick<GameState, 'settings'>): number => (s.settings.farmOnly ? FARM_ONLY.pay : 1)

export function grantCoins(s: GameState, coins: number) {
  s.coins += coins
  s.stats.coinsEarned += coins
}

/**
 * Adds `xp`, which may be a fraction of a point, to the fraction a stream of
 * XP has carried over, and splits the sum into the whole points to pay now and
 * the fraction to carry on, in [0, 1). So how often the player collects or
 * harvests doesn't change what the XP comes to. (Rounded to a millionth, so
 * tenths added up never fall just short of a point.)
 */
export function carryXp(carry: number, xp: number): { whole: number; carry: number } {
  const total = Math.round((carry + xp) * 1e6) / 1e6
  const whole = Math.floor(total)
  return { whole, carry: total - whole }
}

/** Adds XP and handles any level-ups, including bonuses, unlocks, gifts and story lines. */
export function grantXp(s: GameState, amount: number, out: Notice[], now: number) {
  s.xp += Math.max(0, Math.round(amount))
  const level = levelForXp(s.xp)
  while (s.levelSeen < level) {
    s.levelSeen++
    const reached = s.levelSeen
    const bonus = levelBonus(reached)
    grantCoins(s, bonus)
    note(s, out, { kind: 'level', title: `Farm level ${reached}: ${levelTitle(reached)}`, detail: `+${bonus} coins to celebrate.` }, now)
    const u = unlocksAtLevel(reached)
    // Nothing the farm already has is new to it: an upgraded farm can own what opens later now.
    const items = u.items.filter((i) => s.owned[i.id] === 0)
    const names = [...u.crops.map((c) => `${c.name} seeds`), ...items.map((i) => i.name)]
    if (names.length) note(s, out, { kind: 'unlock', title: 'New things to grow and build', detail: names.join(', ') }, now)
    for (const gift of u.gifts) {
      if (!s.gifts.includes(gift.animal)) {
        s.gifts.push(gift.animal)
        note(s, out, { kind: 'animal', journal: 'level', title: gift.title, detail: gift.detail }, now)
      }
    }
    tellLadder(s, now, reached)
  }
}
