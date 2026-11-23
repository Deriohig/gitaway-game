import type { JSX } from 'react'
import type { VisitorId } from '../../../../game/content/visitors'

// Little portraits of the wild visitors for the almanac, in the same hand as
// the icons and item art: soft fills and a warm ink outline. Drawn on a
// 24-unit square; the almanac greys them out into silhouettes until seen.

const INK = '#403D35'
const S = { stroke: INK, strokeWidth: 1.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const CREAM = '#FFF8EC'

const ART: Record<VisitorId, JSX.Element> = {
  hare: (
    <>
      <circle cx="6.8" cy="18.6" r="1.4" fill={CREAM} {...S} />
      <path d="M7.4 21.2c-1.6-4-.6-9 3.6-10.6 3.4-1 6.4 1.4 6.6 5 .2 2.8-.6 4.4-1.6 5.6Z" fill="#B98A63" {...S} />
      <path d="M10.6 14c-.8 2-.6 4.6.4 7h3.2c.8-2 .6-4.6-.6-7Z" fill={CREAM} />
      <path d="M13.2 7.8c-.8-2.6-.6-5.2.4-6.2 1.4.8 1.6 3.6 1 6.2Z" fill="#B98A63" {...S} />
      <path d="M15.4 7.8c.4-2.4 1.4-4.8 2.8-5.4.8 1.2 0 3.8-1.4 5.8Z" fill="#B98A63" {...S} />
      <path d="M13.3 3.2c0-.7.1-1.2.3-1.6.5.3.8.9.9 1.6Z" fill={INK} />
      <path d="M17.3 3.6c.3-.5.6-.9.9-1.2.3.4.2.9 0 1.5Z" fill={INK} />
      <ellipse cx="14.8" cy="9.8" rx="3" ry="2.6" fill="#B98A63" {...S} />
      <circle cx="15.8" cy="9.2" r=".8" fill={INK} />
      <circle cx="17.7" cy="10.4" r=".5" fill={INK} />
    </>
  ),
}

/** A visitor's portrait. Decorative: the name always sits beside it. */
export function VisitorArt({ id, size = 48 }: { id: VisitorId; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      {ART[id]}
    </svg>
  )
}
