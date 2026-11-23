import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SIOFRA, SIOFRA_NAME, type SiofraGiftId } from '../../../../game/content/siofra'
import { VISITORS } from '../../../../game/content/visitors'
import { createInitialState, type GameState } from '../../../../game/state'
import { availableVisitors } from '../../../../game/systems/visitors'
import { withFeatures, type Switches } from '../../../../game/testing'
import { useGame } from '../../../../store/game'
import { VisitorsPage } from './VisitorsPage'

// Lore rule "No counts anywhere": the almanac never says how many it has found, how often a visitor has come or how
// many keepsakes it left. The save still keeps all of it; only the display is bare.

const T0 = Date.UTC(2026, 9, 17, 9, 0, 0)

/** A farm where every listed visitor has been noticed `times` times, and left a keepsake each time. */
function farmSeen(times: number): GameState {
  const s = createInitialState(T0)
  const counts = times ? Object.fromEntries(availableVisitors().map((id) => [id, times])) : {}
  s.visitors.seen = { ...counts }
  s.keepsakes = { ...counts }
  return s
}

/** The page as markup for a farm. A server render reads the store's initial state, so the farm is put there and the store's own put back after. */
function renderPage(game: GameState, switches: Switches = {}): string {
  const initial = useGame.getInitialState()
  const own = initial.game
  initial.game = game
  try {
    return withFeatures({ visitors: true, ...switches }, () => renderToStaticMarkup(createElement(VisitorsPage)))
  } finally {
    initial.game = own
  }
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name: string) => NAMED[name.toLowerCase()] ?? m)

/** What a player can read or hear in some markup: its text plus labels and tooltips, not attributes (test ids, art coordinates). */
function readable(html: string): string {
  const labels = [...html.matchAll(/\s(?:aria-label|title|alt|placeholder)="([^"]*)"/g)].map((m) => m[1])
  return decode([html.replace(/<[^>]*>/g, ' '), ...labels].join(' '))
}

const cardsOf = (html: string) => [...html.matchAll(/<li\b[^>]*data-testid="visitor-card-([^"]+)"[^>]*>.*?<\/li>/gs)].map((m) => ({ id: m[1], html: m[0] }))
/** The "Here now" section holds the level visitors begin at, a number of the economy, not of finds. */
const withoutHereNow = (html: string) => html.replace(/<section\b[^>]*data-testid="visitors-here".*?<\/section>/s, '')

describe('the almanac’s visitors page once Síofra has been met', () => {
  /** A farm where the hare is here now, with these gifts given, and Síofra met or not. */
  function farmWithHare(met: boolean, given: SiofraGiftId[] = []): GameState {
    const s = farmSeen(1)
    s.visitors.present = [{ id: 'hare', arrivedAt: T0 }]
    s.characters.siofra.metAt = met ? T0 : null
    s.characters.siofra.given = given
    return s
  }
  const hareCard = (html: string) => cardsOf(html).find((c) => c.id === 'hare')!.html
  const hereRow = (html: string) => html.match(/<li\b[^>]*data-testid="here-now"[^>]*>.*?<\/li>/s)![0]
  const ALL_GIFTS: SiofraGiftId[] = ['pebble', 'feather', 'clover', 'dandelion', 'shell']

  it('names her on her card, in the Here now row and on the Say hello button, never as the hare', () => {
    const html = renderPage(farmWithHare(true), { characters: true })
    expect(hareCard(html)).toContain(`<strong class="vis-card__name">${SIOFRA_NAME}</strong>`)
    expect(hereRow(html)).toContain(`<strong>${SIOFRA_NAME}</strong>`)
    expect(html).toContain(`aria-label="${SIOFRA.hareOnceMet.sayHello}"`)
    expect(readable(html)).not.toMatch(/brown hare/i)
  })

  it.each([
    ['she has not been met (gifts wait until then)', () => farmWithHare(false, ['pebble']), { characters: true }],
    ['characters are switched off, whatever the save holds', () => farmWithHare(true, ALL_GIFTS), { characters: false }],
  ])('still says the Brown hare when %s', (_, game, switches) => {
    const html = renderPage(game(), switches)
    expect(hareCard(html)).toContain(`<strong class="vis-card__name">${VISITORS.hare.name}</strong>`)
    expect(hereRow(html)).toContain(`<strong>${VISITORS.hare.name}</strong>`)
    expect(html).toContain('aria-label="Say hello to the brown hare"')
    expect(readable(html)).not.toContain(SIOFRA_NAME)
    expect(readable(hareCard(html))).not.toMatch(/Gifts/)
  })

  it('lists the gifts she has given by name, in the order given, and none before any', () => {
    const card = (given: SiofraGiftId[]) => readable(hareCard(renderPage(farmWithHare(true, given), { characters: true })))
    expect(card(['pebble', 'feather'])).toContain(`Gifts: ${SIOFRA.gifts.pebble.item}, ${SIOFRA.gifts.feather.item}`)
    expect(card(['pebble', 'feather'])).toContain('Gifts: Humming pebble, Warm feather')
    expect(card(['feather', 'pebble'])).toContain('Gifts: Warm feather, Humming pebble')
    expect(card([])).toContain(SIOFRA_NAME)
    expect(card([])).not.toMatch(/Gifts/)
  })

  it.each<[SiofraGiftId[]]>([[[]], [['pebble']], [ALL_GIFTS]])('counts nothing: no digit on her card with gifts %j given', (given) => {
    const html = renderPage(farmWithHare(true, given), { characters: true })
    const text = readable(hareCard(html))
    expect(text).not.toMatch(/\d/)
    for (const id of given) expect(text, id).toContain(SIOFRA.gifts[id].item)
    expect(readable(withoutHereNow(html))).not.toMatch(/\d/)
  })
})
