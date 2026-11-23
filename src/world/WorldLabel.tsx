import { Html } from '@react-three/drei'
import type { CSSProperties, ReactNode } from 'react'
import type { MotionLevel } from './motion'

export type V3 = [number, number, number]

/**
 * Html's own `pointerEvents` only reaches its transform mode, so the wrapper
 * it draws round a label is told here. Otherwise a label shown over a small
 * or far-off thing catches the click meant for that thing.
 */
const LABEL_STYLE = { pointerEvents: 'none' } as const

/**
 * A soft label floating in the world: over a visitor, or over something with
 * output ready to collect. Decorative: the almanac and the garden card say the
 * same in words. It eases in, and a farewell fades out, except in Still mode
 * (`motion` is the level in effect, the game's own setting included), where it
 * simply appears and goes. `testId` names its label for tests.
 *
 * `row` draws it that many label heights below its point (above, if
 * negative), clear of a neighbour's label. It is a step on screen, not in the
 * world, because a label is the same size however far off its point is: on a
 * phone, where the island is drawn small, neighbouring labels crowd most.
 *
 * `says` marks a line a character says when tapped (up to 80 characters),
 * which wraps within a narrow block so it stays on a phone's screen, with its
 * bottom edge, not its middle, on `at`, so however many rows it takes it
 * never covers the one saying it; names and other short labels stay on one
 * line, centred on `at`.
 */
export function WorldLabel({
  at,
  children,
  farewell = false,
  motion,
  testId,
  row = 0,
  says = false,
}: {
  at: V3
  children: ReactNode
  farewell?: boolean
  motion: MotionLevel
  testId?: string
  row?: number
  says?: boolean
}) {
  const moves = motion !== 'still'
  const className = ['world-label', says && 'world-label--says', moves && (farewell ? 'world-label--out' : 'world-label--in')].filter(Boolean).join(' ')
  return (
    <Html position={at} center style={LABEL_STYLE} zIndexRange={[30, 0]}>
      <div className={className} style={row ? ({ '--row': row } as CSSProperties) : undefined} aria-hidden="true" data-testid={testId}>
        {children}
      </div>
    </Html>
  )
}
