// Settings → What counts (A7): every rule the farm keeps, in plain words.
// Every number here is read from config when the page is drawn, so the page
// can't drift from what actually happens; none is typed into the text (a test
// checks). It describes the rules, never the player's own progress, and names
// no repository.

import { BONUS, COMMITS, CROPS, CROP_IDS, GROW_MINUTES_PER_XP, ITEMS, LAND, PLOTS, PRICING, SESSION, TASKS, YIELD_CAP_HOURS, levelBonus } from '../../../game/config'
import { REPO_ALIASES } from '../../../game/systems/gitEvents'
import { num } from '../../format'

export interface Rule {
  id: 'sessions' | 'tasks' | 'commits' | 'crops' | 'caps' | 'prices' | 'privacy'
  title: string
  lines: string[]
}

export const WHAT_COUNTS_INTRO = 'Every rule the farm keeps, in plain words. Nothing else is counted.'

const coins = (n: number) => `${num(n)} ${n === 1 ? 'coin' : 'coins'}`
const wood = (n: number) => `${num(n)} ${n === 1 ? 'piece' : 'pieces'} of wood`
const pct = (fraction: number) => `${Math.round(fraction * 100)}%`
const lower = (id: keyof typeof ITEMS) => ITEMS[id].name.toLowerCase()

/** "4 hours", "1 hour 30 minutes", "a minute". */
function span(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const hours = h ? `${h} ${h === 1 ? 'hour' : 'hours'}` : ''
  const mins = m === 1 && !h ? 'a minute' : m ? `${m} ${m === 1 ? 'minute' : 'minutes'}` : ''
  return [hours, mins].filter(Boolean).join(' ')
}

/** The rules, as they stand in config right now. */
export function whatCountsRules(): Rule[] {
  const maxCropXp = Math.max(...CROP_IDS.map((id) => CROPS[id].xp))
  const levelStep = levelBonus(1) - levelBonus(0)
  return [
    {
      id: 'sessions',
      title: 'Work sessions',
      lines: [
        `Every minute of a work session earns ${coins(SESSION.coinsPerMinute)} and ${num(SESSION.xpPerMinute)} XP, and every ${num(SESSION.minutesPerWood)} minutes bring a piece of wood.`,
        `End a session whenever you like: it pays for every whole minute it ran. One shorter than ${span(SESSION.minMinutes)} earns nothing.`,
        `A session earns for up to ${span(SESSION.maxMinutes)}, then rests until you start another.`,
      ],
    },
    {
      id: 'tasks',
      title: 'Tasks',
      lines: [`Each finished task you log earns ${coins(TASKS.coins)}, ${num(TASKS.xp)} XP and ${wood(TASKS.wood)}. The same task pays once a day.`],
    },
    {
      id: 'commits',
      title: 'Commits (desktop app)',
      lines: [
        `Each of your own commits in a repository you chose earns ${coins(COMMITS.coins)} and ${num(COMMITS.xp)} XP. Only commits made after you start watching count.`,
        "Merges, empty commits and commits already counted don't count, and a commit seen again in another watched folder is passed over.",
        'A commit pays on the day Gitaway first sees it, even if its date is ahead of your clock.',
        "Only commits dated after the newest one already counted can count, or after you started watching if none has been. If that one was dated ahead of your clock, anything dated after Gitaway saw it can.",
      ],
    },
    {
      id: 'crops',
      title: 'Crops',
      lines: [
        "Crops grow on real time, even while Gitaway is closed, and wait for you once they're ripe. Nothing withers.",
        `A harvest sells at the crop's price, and earns a point of XP for every ${num(GROW_MINUTES_PER_XP)} minutes the crop grew, up to ${num(maxCropXp)} XP.`,
        `A crop that differs from the one its bed grew last, or a bed's first crop, sells for ${pct(BONUS.freshSoil)} more. The ${lower('windmill')} adds ${pct(BONUS.windmillHarvest)} to every harvest, and with the ${lower('greenhouse')}, new crops grow ${pct(BONUS.greenhouseGrowth)} faster.`,
      ],
    },
    {
      id: 'caps',
      title: 'Caps and rest',
      lines: [
        `Each day, up to ${span(SESSION.dailyMinuteCap)} of focus, ${num(TASKS.dailyLimit)} tasks and ${num(COMMITS.dailyLimit)} commits earn rewards.`,
        'Once one of them is reached, that part of the field is full for today; the others still count. Nothing is lost, and the field is fresh again after midnight, your time.',
        `What the farm makes on its own waits for you, up to ${num(YIELD_CAP_HOURS)} hours' worth of each kind. That's a cap, never a loss.`,
        "Days off cost nothing. Nothing on the island decays, expires or resets while you're away.",
      ],
    },
    {
      id: 'prices',
      title: 'Prices',
      lines: [
        `Garden plots start at ${coins(PLOTS.baseCost)}, and each one bought adds ${coins(PLOTS.costStep)} to the next.`,
        `New land costs the same whichever piece you pick: ${coins(LAND.coins.base)} and ${wood(LAND.wood.base)} for the first, then each piece costs ${pct(LAND.coins.growth - 1)} more coins and ${pct(LAND.wood.growth - 1)} more wood than the one before.`,
        `Beyond those you started with, each extra one of anything else you can own several of costs ${pct(PRICING.repeatGrowth - 1)} more than the last.`,
        `Each new level brings a gift of ${coins(levelBonus(0))}, plus ${num(levelStep)} times its number.`,
      ],
    },
    {
      id: 'privacy',
      title: 'Privacy',
      lines: [
        'Everything stays on this device. Gitaway makes no network requests, and has no accounts and no analytics.',
        'For commits, the desktop app reads only which commits are yours and when they were made: never code, messages or file names.',
        `Repositories go by tree names (${REPO_ALIASES[0]}, ${REPO_ALIASES[1]} and so on) wherever Gitaway tells you about them. Their folder names show only in Settings → Commits, where you choose them.`,
      ],
    },
  ]
}
