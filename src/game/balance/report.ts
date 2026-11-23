// The balance report (spec §2): the seven targets as exact checks over the
// simulated players' logs, and a printout of how each player's game went.

import { availableItems } from '../available'
import { CROPS, CROP_IDS, ITEMS, PLOTS, SESSION, type CropId, type ItemId } from '../config'
import { cropXp, growMs, harvestValue, isCropUnlocked, itemPrice, landOwned } from '../engine'
import { xpForLevel } from '../progression'
import { plural } from '../result'
import { createInitialState, type GameState } from '../state'
import { HOUR, PROFILES, T0, weekday, type DayLog, type PlayerKind, type Tally } from './players'
import { LAND_ORDER } from './strategy'

export interface TargetResult {
  id: 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7'
  pass: boolean
  detail: string
}

/** Every piece of land there is to own. */
const LAND = availableItems().filter((id) => ITEMS[id].category === 'land')

const CURRENCIES = ['coins', 'wood', 'xp'] as const

/** The days the targets read, other than T1's: the first two weeks. */
const FORTNIGHT = 14

const pct = (share: number) => `${Math.round(share * 100)}%`
const ratio = (x: number) => (x === Infinity ? '∞' : x.toFixed(2))

interface Purchase {
  id: ItemId
  day: number
  coins: number
  wood: number
}

/** Every purchase with the price paid, found by putting the purchases through the shop's prices in order, and the shop as it ends up. */
function purchases(logs: DayLog[]): { paid: Purchase[]; shop: GameState } {
  const shop = createInitialState(T0)
  const paid = logs.flatMap((log) =>
    log.bought.map((id) => {
      const price = itemPrice(shop, id)
      shop.owned[id]++
      return { id, day: log.day, ...price }
    }),
  )
  return { paid, shop }
}

/** The day each piece of land was bought. */
function landDays(logs: DayLog[]): Partial<Record<ItemId, number>> {
  const days: Partial<Record<ItemId, number>> = {}
  for (const log of logs) for (const id of log.bought) if (ITEMS[id].category === 'land') days[id] ??= log.day
  return days
}

/** The day the last piece of land was bought, or null while any is missing. */
function allLandDay(logs: DayLog[]): number | null {
  const days = landDays(logs)
  return LAND.every((id) => days[id] !== undefined) ? Math.max(...LAND.map((id) => days[id]!)) : null
}

/** Where a player's land stands at the end of their logs. */
function landStatus(logs: DayLog[]): string {
  const done = allLandDay(logs)
  if (done !== null) return `owns all ${LAND.length} pieces of land on day ${done}`
  const days = landDays(logs)
  const { shop } = purchases(logs)
  const end = logs[logs.length - 1]
  const missing = LAND.filter((id) => days[id] === undefined)
  // Every piece not yet owned costs the same; the next is the one the players want most.
  const next = LAND_ORDER.find((id) => missing.includes(id)) ?? missing[0]
  const price = itemPrice(shop, next)
  return (
    `owns ${landOwned(shop)}/${LAND.length} pieces of land by day ${end.day}; ` +
    `the next, ${next}, costs ${price.coins} coins and ${price.wood} wood, with ${end.coins} coins and ${end.wood} wood in hand`
  )
}

/** The day each level was first reached. */
function levelDays(logs: DayLog[]): Record<number, number> {
  const days: Record<number, number> = {}
  let level = 1
  for (const log of logs) while (level < log.level) days[++level] = log.day
  return days
}

/** Each crop's share of harvest coins, largest first. */
function cropShares(logs: DayLog[]): [CropId, number][] {
  const coins: Partial<Record<CropId, number>> = {}
  for (const log of logs) {
    for (const [crop, paid] of Object.entries(log.harvest) as [CropId, number][]) coins[crop] = (coins[crop] ?? 0) + paid
  }
  const total = Object.values(coins).reduce((a, b) => a + b, 0)
  return (Object.entries(coins) as [CropId, number][]).map(([crop, paid]): [CropId, number] => [crop, paid / total]).sort((a, b) => b[1] - a[1])
}

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * What the farm leaves the player on a day: what it brought in, less what its
 * seeds cost. Work has no running cost; seeds cost neither wood nor XP.
 */
const farmNet = (log: DayLog): Tally => ({ ...log.earned.farm, coins: log.earned.farm.coins - log.seeds })

/** The days work is weighed against the farm: a player's workdays in the first two weeks, or every one of those days if they don't work. */
function weighedDays(logs: DayLog[], kind: PlayerKind): DayLog[] {
  const { workdays } = PROFILES[kind]
  return logs.filter((log) => log.day <= FORTNIGHT && (!workdays.length || workdays.includes(weekday(log.day))))
}

/** Which days `weighedDays` takes, in words. */
const weighed = (kind: PlayerKind) => `${PROFILES[kind].workdays.length ? 'workdays in ' : ''}days 1–${FORTNIGHT}`

/**
 * Work's earnings over the farm's net ones, per currency: the median across
 * the weighed days, or null if the player doesn't work. A day the farm left no
 * coins, or fewer than none (its seeds cost more than it brought in), has no
 * ratio worth taking, so it's skipped and counted.
 */
function workRatios(logs: DayLog[], kind: PlayerKind): { ratios: Tally; skipped: number } | null {
  const weighedOnes = weighedDays(logs, kind)
  const days = weighedOnes.filter((log) => farmNet(log).coins > 0)
  if (!PROFILES[kind].workdays.length || !days.length) return null
  const of = (c: keyof Tally) => median(days.map((log) => log.earned.work[c] / farmNet(log)[c]))
  return { ratios: { coins: of('coins'), wood: of('wood'), xp: of('xp') }, skipped: weighedOnes.length - days.length }
}

/** The days a ratio skipped, in words, or nothing when it skipped none. */
const skippedNote = (skipped: number) => (skipped ? `; skipped ${plural(skipped, 'day', 'days')} the farm left no coins on` : '')

/** Every harvest whose crops' coins didn't add up, across the players, each named with its player and day. */
function mismatches(logs: Record<PlayerKind, DayLog[]>): string[] {
  return (Object.keys(logs) as PlayerKind[]).flatMap((kind) => logs[kind].flatMap((log) => log.mismatches.map((m) => `${kind} day ${log.day} ${m}`)))
}

/** A weighed day's coins, each the median across the weighed days: work's, and the farm's before seeds, its seeds and what it leaves. */
function coinMedians(logs: DayLog[], kind: PlayerKind): { work: number; gross: number; seeds: number; net: number } {
  const days = weighedDays(logs, kind)
  const of = (coins: (log: DayLog) => number) => Math.round(median(days.map(coins)))
  return {
    work: of((log) => log.earned.work.coins),
    gross: of((log) => log.earned.farm.coins),
    seeds: of((log) => log.seeds),
    net: of((log) => farmNet(log).coins),
  }
}

export function evaluate(logs: Record<PlayerKind, DayLog[]>): TargetResult[] {
  const fortnight = logs.worker.filter((log) => log.day <= FORTNIGHT)
  const end = fortnight[fortnight.length - 1]

  const workerLand = allLandDay(logs.worker)
  const farmerLand = allLandDay(logs.farmer)

  const work = workRatios(logs.worker, 'worker')
  const ratios = work?.ratios ?? null

  const quiet = fortnight
    .filter((log) => weekday(log.day) !== 0 && weekday(log.day) !== 6 && log.bought.length + log.unlocked.length < 1)
    .map((log) => log.day)

  const dayOne = logs.worker[0]?.bought ?? []

  const shares = cropShares(fortnight)
  const [top] = shares
  const worthGrowing = shares.filter(([, share]) => share >= 0.05).length
  // The shares are only as good as the tally behind them.
  const unmatched = mismatches(logs)

  // Each currency against the most of it one purchase took.
  const { paid } = purchases(fortnight)
  const dearest = (c: 'coins' | 'wood') => paid.reduce<Purchase | null>((best, p) => (!best || p[c] > best[c] ? p : best), null)
  const dearestCoins = dearest('coins')
  const dearestWood = dearest('wood')

  const farmerFirstLand = logs.farmer.find((log) => log.bought.some((id) => ITEMS[id].category === 'land'))
  const farmerEnd = logs.farmer[logs.farmer.length - 1]

  return [
    {
      id: 'T1',
      pass: workerLand !== null && workerLand >= 13 && workerLand <= 15 && farmerLand !== null && farmerLand >= 40 && farmerLand <= 55,
      detail: `worker ${landStatus(logs.worker)} (want all on day 13–15); farmer ${landStatus(logs.farmer)} (want all on day 40–55)`,
    },
    {
      id: 'T2',
      pass: ratios !== null && Object.values(ratios).every((r) => r >= 2 && r <= 3),
      detail: work
        ? `worker's work/farm, the farm net of seeds, median of ${weighed('worker')}: ${CURRENCIES.map((c) => `${c} ${ratio(work.ratios[c])}`).join(', ')} (want 2–3 each)${skippedNote(work.skipped)}`
        : 'the worker has no workdays the farm left coins on',
    },
    {
      id: 'T3',
      pass: quiet.length === 0,
      detail: quiet.length ? `worker had nothing new on day ${quiet.join(', ')}` : 'worker had something new every weekday',
    },
    {
      id: 'T4',
      pass: dayOne.length >= 3 && dayOne.includes('woodshed'),
      detail: `worker bought ${dayOne.length} on day 1${dayOne.length ? `: ${dayOne.join(', ')}` : ''} (want 3 or more, the woodshed among them)`,
    },
    {
      id: 'T5',
      pass: top !== undefined && top[1] <= 0.4 && worthGrowing >= 4 && unmatched.length === 0,
      detail:
        (top
          ? `worker's top crop, ${top[0]}, made ${pct(top[1])} of harvest coins (want 40% at most); ${plural(worthGrowing, 'crop', 'crops')} made 5% or more (want 4 or more)`
          : 'the worker harvested nothing') +
        (unmatched.length
          ? `; ${plural(unmatched.length, "harvest doesn't", "harvests don't")} add up (see each player's harvests line), so the shares can't be trusted`
          : ''),
    },
    {
      id: 'T6',
      pass: !!end && !!dearestCoins && !!dearestWood && end.coins < dearestCoins.coins && end.wood < dearestWood.wood,
      detail:
        end && dearestCoins && dearestWood
          ? `worker ends day ${end.day} with ${end.coins} coins and ${end.wood} wood; ` +
            `the most coins it paid was ${dearestCoins.coins}, for ${dearestCoins.id} on day ${dearestCoins.day}, ` +
            `and the most wood ${dearestWood.wood}, for ${dearestWood.id} on day ${dearestWood.day} (want less of each in hand)`
          : 'the worker bought nothing',
    },
    {
      id: 'T7',
      pass: farmerFirstLand !== undefined && farmerFirstLand.day <= 3,
      detail: farmerFirstLand
        ? `farmer's first land, ${farmerFirstLand.bought.find((id) => ITEMS[id].category === 'land')}, on day ${farmerFirstLand.day} (want by day 3)`
        : `farmer bought no land in ${logs.farmer.length} days, ending with ${farmerEnd?.coins} coins and ${farmerEnd?.wood} wood (want some by day 3)`,
    },
  ]
}

/** The levels the desk clicker is looked at: a new farm, the windmill's level and the greenhouse's among them. */
const DESK_LEVELS = [1, 3, 5, ITEMS.windmill.unlockLevel, ITEMS.greenhouse.unlockLevel]

/**
 * What clicking at the desk earns an hour at a level: one crop on every plot
 * there can be, replanted the moment it's ripe, with the windmill and the
 * greenhouse once the level opens them. The crop is the one that earns the
 * most XP, then the most coins; coins are net of seeds, and the same crop
 * again never gets fresh soil. Information only, not a target.
 */
function deskClicker(level: number): { crop: CropId; xp: number; coins: number } | null {
  const s = createInitialState(T0)
  s.xp = xpForLevel(level)
  s.levelSeen = level
  for (const id of ['windmill', 'greenhouse'] as const) if (level >= ITEMS[id].unlockLevel) s.owned[id] = 1
  let best: { crop: CropId; xp: number; coins: number } | null = null
  for (const crop of CROP_IDS) {
    if (!isCropUnlocked(s, crop)) continue
    const harvests = (PLOTS.max * HOUR) / growMs(s, crop)
    const rate = { crop, xp: harvests * cropXp(crop), coins: harvests * (harvestValue(s, crop) - CROPS[crop].seedCost) }
    if (!best || rate.xp > best.xp + 1e-9 || (Math.abs(rate.xp - best.xp) <= 1e-9 && rate.coins > best.coins)) best = rate
  }
  return best
}

/** The desk clicker's line, against an hour of work. */
function deskLine(): string {
  const rates = DESK_LEVELS.map((level) => {
    const r = deskClicker(level)
    return r ? `L${level} ${r.crop} ${r.xp.toFixed(1)} XP/h, ${Math.round(r.coins)} coins/h` : `L${level} -`
  })
  const work = `work ${60 * SESSION.xpPerMinute} XP/h, ${60 * SESSION.coinsPerMinute} coins/h`
  return `desk clicker: ${rates.join('; ')}; ${work} (one crop on all ${PLOTS.max} plots, replanted when ripe; coins net of seeds; information only, not a target)`
}

export function printReport(logs: Record<PlayerKind, DayLog[]>, results: TargetResult[]): void {
  const lines = ['', 'Balance report']
  for (const kind of Object.keys(logs) as PlayerKind[]) {
    const run = logs[kind]
    const land = landDays(run)
    const levels = Object.entries(levelDays(run))
    // The days T5 reads, for every player alike.
    const shares = cropShares(run.filter((log) => log.day <= FORTNIGHT))
    const work = workRatios(run, kind)
    const coins = coinMedians(run, kind)
    const unmatched = mismatches({ [kind]: run } as Record<PlayerKind, DayLog[]>)
    lines.push(
      '',
      `${kind}: ${run.length} days, ending at level ${run[run.length - 1]?.level}`,
      `  land bought:  ${LAND.map((id) => `${id} ${land[id] ? `day ${land[id]}` : '-'}`).join(', ')}`,
      `  levels:       ${levels.length ? levels.map(([level, day]) => `L${level} day ${day}`).join(', ') : '-'}`,
      `  crop shares:  ${shares.length ? `${shares.map(([crop, share]) => `${crop} ${pct(share)}`).join(', ')} (days 1–${FORTNIGHT})` : '-'}`,
      `  farm coins:   ${coins.gross} brought in, ${coins.seeds} on seeds, ${coins.net} left; work ${coins.work} (each figure a median of ${weighed(kind)}, taken on its own)`,
      `  work/farm:    ${work ? `${CURRENCIES.map((c) => `${c} ${ratio(work.ratios[c])}`).join(', ')} (the farm net of seeds; median of ${weighed(kind)}${skippedNote(work.skipped)})` : PROFILES[kind].workdays.length ? 'no workday the farm left coins on' : 'no work'}`,
      `  harvests:     ${unmatched.length ? `${plural(unmatched.length, "harvest doesn't", "harvests don't")} add up: ${unmatched.join('; ')}` : 'every crop share adds up to what its harvest paid'}`,
    )
  }
  lines.push('', deskLine())
  lines.push('', 'Targets')
  for (const r of results) lines.push(`  ${r.id} ${r.pass ? 'PASS' : 'FAIL'}  ${r.detail}`)
  console.log(lines.join('\n'))
}
