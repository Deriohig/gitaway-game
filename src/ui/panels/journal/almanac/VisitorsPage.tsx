import { useEffect, useRef, useState } from 'react'
import { UNLOCKS, type IslandId } from '../../../../game/config'
import { SIOFRA } from '../../../../game/content/siofra'
import { VISITORS, type VisitorId } from '../../../../game/content/visitors'
import { availableVisitors, hereNow, keepsakeLine, noticeVisitor, ownName, sayHelloLabel, visitorName } from '../../../../game/systems/visitors'
import { useGame } from '../../../../store/game'
import { VisitorArt } from './visitorArt'

const ISLANDS: { id: IslandId; name: string }[] = [
  { id: 'main', name: 'Home island' },
  { id: 'meadow', name: 'Meadow isle' },
  { id: 'grove', name: 'Forest grove' },
  { id: 'islet', name: 'Lighthouse islet' },
  { id: 'wetland', name: 'Wetland isle' },
  { id: 'highland', name: 'Highland isle' },
]

/** One visitor who is here now, by the name the farm knows them by (Síofra, once she has been met), with Say hello. */
function HereRow({ id, onHello }: { id: VisitorId; onHello: (id: VisitorId) => void }) {
  const v = VISITORS[id]
  const name = useGame((s) => visitorName(s.game, id))
  const named = useGame((s) => ownName(s.game, id))
  return (
    <li className="vis-here__item" data-testid="here-now" data-visitor={id}>
      <span className="vis-here__art">
        <VisitorArt id={id} size={40} />
      </span>
      <span className="vis-here__text">
        <strong>{name}</strong>
        <span>{v.where.charAt(0).toUpperCase() + v.where.slice(1)}</span>
      </span>
      <button className="btn btn--small" onClick={() => onHello(id)} aria-label={sayHelloLabel(id, named)} data-testid={`say-hello-${id}`}>
        Say hello
      </button>
    </li>
  )
}

/** Who is here now, with a way to say hello from the keyboard. */
function HereNow() {
  const present = hereNow(useGame((s) => s.game.visitors.present))
  const open = useGame((s) => s.game.visitors.since !== null)
  const run = useGame((s) => s.run)
  const [thanks, setThanks] = useState<VisitorId | null>(null)
  // The line after saying hello, by the visitor's own name once it has one.
  const thanksLine = useGame((s) => (thanks ? keepsakeLine(thanks, ownName(s.game, thanks)) : ''))
  const list = useRef<HTMLUListElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  // Where the focus goes once a visitor has left: the button that took its place.
  const refocus = useRef<number | null>(null)

  // The pressed button goes with its visitor, so the focus moves on to the
  // next Say hello, or to the heading once nobody is left.
  useEffect(() => {
    const at = refocus.current
    if (at === null) return
    refocus.current = null
    const buttons = list.current?.querySelectorAll<HTMLButtonElement>('button') ?? []
    const next = buttons[Math.min(at, buttons.length - 1)] ?? heading.current
    next?.focus()
  })

  const hello = (id: VisitorId) => {
    const at = present.findIndex((p) => p.id === id)
    if (!run((s, now) => noticeVisitor(s, id, now))) return
    refocus.current = at
    setThanks(id)
  }

  return (
    <section className="vis-here" aria-labelledby="vis-here-title" data-testid="visitors-here">
      <h3 id="vis-here-title" className="vis-heading" ref={heading} tabIndex={-1}>
        Here now
      </h3>
      {present.length > 0 ? (
        <ul className="vis-here__list" ref={list}>
          {present.map((p) => (
            <HereRow key={p.id} id={p.id} onHello={hello} />
          ))}
        </ul>
      ) : (
        <p className="vis-empty">
          {open
            ? 'Nobody is visiting just now. The hare comes by now and then.'
            : `The hare starts coming by once the farm reaches level ${UNLOCKS.visitors}.`}
        </p>
      )}
      <p className="vis-thanks" aria-live="polite" data-testid="visitor-thanks">
        {thanksLine}
      </p>
    </section>
  )
}

/**
 * A visitor's card: a silhouette until seen, then its keepsake. Under the name the farm knows it by (Síofra, once she
 * has been met), her card lists the gifts she has given, by name, in the order given, and never says how many.
 */
function VisitorCard({ id, met }: { id: VisitorId; met: boolean }) {
  const v = VISITORS[id]
  const name = useGame((s) => visitorName(s.game, id))
  const named = useGame((s) => ownName(s.game, id))
  const given = useGame((s) => s.game.characters.siofra.given)
  const gifts = id === 'hare' && named ? given.map((gift) => SIOFRA.gifts[gift].item) : []
  return (
    <li className={`vis-card ${met ? '' : 'vis-card--unseen'}`} data-testid={`visitor-card-${id}`} data-seen={met}>
      <span className="vis-card__art">
        <VisitorArt id={id} size={44} />
      </span>
      <span className="vis-card__body">
        <strong className="vis-card__name">{name}</strong>
        {met ? (
          <>
            <span className="vis-card__keepsake" data-testid={`keepsake-${id}`}>
              {v.keepsake}
            </span>
            {gifts.length > 0 && (
              <span className="vis-card__gifts" data-testid={`gifts-${id}`}>
                {`Gifts: ${gifts.join(', ')}`}
              </span>
            )}
            <span className="vis-card__seen">Seen before</span>
          </>
        ) : (
          <span className="vis-card__hint">{v.hint}</span>
        )}
      </span>
    </li>
  )
}

/**
 * Almanac → Visitors: "Here now" with Say hello, then a card per visitor, a
 * silhouette until seen. Only visitors that are part of the game are listed,
 * and an isle with none of them has no section.
 *
 * No counts anywhere (docs/lore/BIBLE.md): the page never says how many have
 * been found, how often one has come or how many keepsakes it left. A card is
 * a silhouette or it's filled in. The save keeps the tallies all the same.
 */
export function VisitorsPage() {
  const seen = useGame((s) => s.game.visitors.seen)
  const listed = availableVisitors()

  return (
    <div className="vis-page" data-testid="visitors-page">
      <HereNow />
      {ISLANDS.map((island) => {
        const ids = listed.filter((id) => VISITORS[id].island === island.id)
        if (!ids.length) return null
        return (
          <section key={island.id} className="vis-group" aria-label={island.name}>
            <h3 className="vis-heading">{island.name}</h3>
            <ul className="vis-cards">
              {ids.map((id) => (
                <VisitorCard key={id} id={id} met={(seen[id] ?? 0) > 0} />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
