// The workshop (B2, B7): the barn and its keep targets, producers, station
// jobs, workbench crafting and the helpers. Nothing in the barn spoils, jobs
// have no deadlines, and offline production is capped, never taken away.

import { CROP_IDS } from '../config'
import { GOOD_IDS, PRODUCER_IDS, STATION_IDS, stationRecipes, type ProducerId, type StationId } from '../content/goods'
import type { Notice } from '../result'
import { bool, count, countMap, field, isObj, num, time } from '../sanitize'
import type { GameState, Job } from '../state'

/** Most of one crop the barn can be asked to keep. */
export const KEEP_MAX = 999

function jobsFrom(raw: unknown): Job[] {
  const busy = new Set<StationId>()
  const ids = new Set<number>()
  const jobs: Job[] = []
  for (const j of Array.isArray(raw) ? raw : []) {
    if (!isObj(j)) continue
    const id = count(j.id)
    const station = STATION_IDS.find((x) => x === j.station)
    const recipe = station && stationRecipes(station).find((r) => r === j.recipe)
    const startedAt = time(j.startedAt)
    const readyAt = time(j.readyAt)
    // One job per station, and only recipes that station can make.
    if (!id || !station || !recipe || startedAt === null || readyAt === null || readyAt < startedAt) continue
    if (busy.has(station) || ids.has(id)) continue
    busy.add(station)
    ids.add(id)
    jobs.push({ id, station, recipe, startedAt, readyAt })
  }
  return jobs
}

export function sanitizeWorkshop(
  raw: unknown,
  _base: GameState,
  _now: number,
): Pick<GameState, 'barn' | 'keep' | 'jobs' | 'jobSeq' | 'producers' | 'made' | 'helpers'> {
  const barn = field(raw, 'barn')
  const producers = field(raw, 'producers')
  const progress = field(producers, 'progress')
  const jobs = jobsFrom(field(raw, 'jobs'))
  return {
    barn: { produce: countMap(field(barn, 'produce'), CROP_IDS), goods: countMap(field(barn, 'goods'), GOOD_IDS) },
    keep: countMap(field(raw, 'keep'), CROP_IDS, KEEP_MAX),
    jobs,
    jobSeq: Math.max(count(field(raw, 'jobSeq')), ...jobs.map((j) => j.id), 0),
    producers: {
      at: time(field(producers, 'at')),
      progress: Object.fromEntries(PRODUCER_IDS.map((id) => [id, num(field(progress, id), 0, 0, 1e6)])) as Record<ProducerId, number>,
    },
    made: countMap(field(raw, 'made'), GOOD_IDS),
    helpers: { replant: bool(field(field(raw, 'helpers'), 'replant'), false), harvest: bool(field(field(raw, 'helpers'), 'harvest'), false) },
  }
}

/**
 * Time-driven work, in order: the garden robin's harvests, producers, then
 * finished station jobs. Nothing runs until the workshop feature builds it.
 */
export function advanceWorkshop(_s: GameState, _now: number, _out: Notice[]): boolean {
  return false
}
