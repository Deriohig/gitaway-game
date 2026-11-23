import type { ReactNode } from 'react'

/**
 * Recolours whatever it wraps with one of the studio's palette swatches (B5).
 * Draws its children unchanged until the studio feature fills it in.
 */
export function Tint(props: { swatch: number | null; children: ReactNode }) {
  return <>{props.children}</>
}
