import { plural } from '../result'

// Idle yields (spec §3): what the farm makes on its own, with no one asking.
// Hens and ducks lay, sheep grow fleeces, goats give milk, bees fill jars,
// fruit trees drop fruit, the wetland lands fish and the woodshed stacks
// logs. Collecting turns goods into coins and a little XP; logs go straight
// to the wood pile. Animals never speak: the lines only say what happened.

export type YieldId = 'eggs' | 'wool' | 'milk' | 'honey' | 'fruit' | 'fish' | 'wood'

export interface YieldDef {
  id: YieldId
  /** How one unit and several are counted: "1 egg", "3 baskets of fruit". */
  unit: [one: string, many: string]
  /** Hours for one unit from one source. */
  hours: number
  /** What collecting a unit adds to: coins, or the wood pile. */
  pays: 'coins' | 'wood'
  /** Coins or wood per unit. */
  value: number
  /** XP per unit; may be fractional: collecting grants whole points and carries the rest to the next collect. */
  xp: number
  /** The narrated line for collecting `n` units. */
  line: (n: number) => string
}

/** "3 eggs", "1 basket of fruit". */
export const yieldAmount = (id: YieldId, n: number): string => plural(n, ...YIELDS[id].unit)

const was = (n: number) => (n === 1 ? 'was' : 'were')

export const YIELDS: Record<YieldId, YieldDef> = {
  eggs: { id: 'eggs', unit: ['egg', 'eggs'], hours: 12, pays: 'coins', value: 4, xp: 0.1, line: (n) => `The hens laid ${yieldAmount('eggs', n)}.` },
  wool: { id: 'wool', unit: ['fleece', 'fleeces'], hours: 12, pays: 'coins', value: 6, xp: 0.25, line: (n) => `The sheep grew ${yieldAmount('wool', n)}.` },
  milk: {
    id: 'milk', unit: ['pail of milk', 'pails of milk'], hours: 12, pays: 'coins', value: 6, xp: 0.25,
    line: (n) => `The goats gave ${yieldAmount('milk', n)}.`,
  },
  honey: {
    id: 'honey', unit: ['jar of honey', 'jars of honey'], hours: 12, pays: 'coins', value: 8, xp: 0.25,
    line: (n) => `The bees filled ${yieldAmount('honey', n)}.`,
  },
  fruit: {
    id: 'fruit', unit: ['basket of fruit', 'baskets of fruit'], hours: 12, pays: 'coins', value: 3, xp: 0.1,
    line: (n) => `The trees dropped ${yieldAmount('fruit', n)}.`,
  },
  fish: {
    id: 'fish', unit: ['fish', 'fish'], hours: 6, pays: 'coins', value: 4, xp: 0.25,
    line: (n) => `${yieldAmount('fish', n)} ${was(n)} landed in the wetland.`,
  },
  wood: {
    id: 'wood', unit: ['log', 'logs'], hours: 6, pays: 'wood', value: 1, xp: 0.125,
    line: (n) => `${yieldAmount('wood', n)} ${was(n)} split and stacked.`,
  },
}

export const YIELD_IDS = Object.keys(YIELDS) as YieldId[]

/**
 * What one producer makes, for its card, from its yield's unit and hours, so
 * the card follows the tuning: "Lays an egg every 12 hours."
 */
export function yieldEffect(id: YieldId, verb: string): string {
  const { unit: [one], hours } = YIELDS[id]
  const every = hours === 1 ? 'every hour' : `every ${hours} hours`
  return `${verb} ${/^[aeiou]/i.test(one) ? 'an' : 'a'} ${one} ${every}.`
}
