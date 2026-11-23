import type { JSX } from 'react'
import type { BundleId } from '../../../game/content/bundles'

// A small picture of each restoration's change, in the same hand as the
// item art: soft fills, a warm ink outline, a strip of ground.

const INK = '#403D35'
const S = { stroke: INK, strokeWidth: 1.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const C = {
  grass: '#A9BA8C',
  meadow: '#7D9B70',
  forest: '#526E58',
  sage: '#9CAF88',
  stone: '#C9BFB0',
  stoneDark: '#9E968B',
  wood: '#A9825D',
  woodLight: '#C29E76',
  woodDark: '#7D5F45',
  water: '#91B7C8',
  sky: '#BFD7DE',
  cream: '#FFF8EC',
  wall: '#EFE3CC',
  roof: '#C98268',
  gold: '#E8BD72',
  blossom: '#E7B8A8',
  lavender: '#B9A3C9',
  glow: '#F3D9A4',
}

const ground = (fill = C.grass) => <path d="M2 31c8-3.4 36-3.4 44 0v3H2Z" fill={fill} {...S} />
const water = (d = 'M4 30c6-3 34-3 40 0-6 3-34 3-40 0Z') => <path d={d} fill={C.water} {...S} />
const cloud = (x: number, y: number) => <path d={`M${x} ${y}h9a2.5 2.5 0 0 0-2.5-3 3 3 0 0 0-5.5.6A2 2 0 0 0 ${x} ${y}Z`} fill={C.cream} stroke={INK} strokeWidth={0.9} />
/** A reed of the reed beds, the `i`th of its run: every other one leans right, every third is the dark green. */
const reed = (x: number, i: number) => (
  <path key={x} d={`M${x} 29c0-6 ${i % 2 ? 1 : -1} -12 ${i % 2 ? 2 : -1} -18`} stroke={i % 3 ? C.meadow : C.forest} strokeWidth={1.4} strokeLinecap="round" fill="none" />
)

const ART: Record<BundleId, JSX.Element> = {
  gardenGate: (
    <>
      {ground()}
      <path d="M13 30V17a11 11 0 0 1 22 0v13h-4.5V17a6.5 6.5 0 0 0-13 0v13Z" fill={C.stone} {...S} />
      <path d="M12 17h6M30 17h6M22 6.6l4 .2" stroke={C.stoneDark} strokeWidth={1.4} strokeLinecap="round" />
      <path d="M33 29c-1.5-3 1.5-5-.5-8M33 22c1.6-1 2.8-.4 3.2.8M32.6 26c-1.6-.6-2.6 0-2.8 1.2" stroke={C.forest} strokeWidth={1.4} strokeLinecap="round" fill="none" />
      <path d="M18 30l2-7h8l2 7" fill="#C8B08E" stroke="none" />
    </>
  ),
  pondJetty: (
    <>
      {ground()}
      {water('M27 30.6c3.5-2.4 13.5-2.4 17 0-3.5 2.2-13.5 2.2-17 0Z')}
      <path d="M9 22v-7M23 22v-7" stroke={C.woodDark} strokeWidth={1.6} strokeLinecap="round" />
      <path d="M8 15h16v2.4H8ZM8 18.6h16v2H8Z" fill={C.wood} {...S} />
      <path d="M7 22h18v2.6H7Z" fill={C.woodLight} {...S} />
      <path d="M9 24.6v5.4M23 24.6v5.4" stroke={C.woodDark} strokeWidth={1.6} strokeLinecap="round" />
      <path d="M25 29.5L39 12" stroke={C.woodDark} strokeWidth={0.9} strokeLinecap="round" />
      <path d="M39 12c.8 5 .8 11 .3 18.2" stroke={INK} strokeWidth={0.5} fill="none" />
      <path d="M37.1 30.8c1.5-.8 3-.8 4.5 0" stroke={C.cream} strokeWidth={1} strokeLinecap="round" fill="none" />
    </>
  ),
  kitchenShelf: (
    <>
      {ground('#C8B08E')}
      <path d="M4 30V8h14v22" fill={C.wall} {...S} />
      <path d="M18 12h24M22 12v18M38 12v18" stroke={C.woodDark} strokeWidth={1.4} strokeLinecap="round" />
      <path d="M24 12v4M28 12v5M32 12v4M36 12v5" stroke={INK} strokeWidth={0.8} />
      <path d="M22.6 16h2.8l-1.4 4ZM26.6 17h2.8l-1.4 4ZM30.6 16h2.8l-1.4 4ZM34.6 17h2.8l-1.4 4Z" fill={C.sage} stroke={INK} strokeWidth={0.8} strokeLinejoin="round" />
      <path d="M30.6 16h2.8l-1.4 4Z" fill={C.lavender} stroke={INK} strokeWidth={0.8} />
      <path d="M24 30v-5h12v5M23 25h14" fill={C.woodLight} {...S} />
      <rect x="26.5" y="21.5" width="3" height="3.5" rx="0.8" fill={C.blossom} {...S} />
      <path d="M32 22h2.6v3H32Z" fill={C.cream} {...S} />
    </>
  ),
  waterwheel: (
    <>
      {water('M2 30c8-2.5 36-2.5 44 0-8 3-36 3-44 0Z')}
      <circle cx="22" cy="20" r="9" fill={C.woodLight} {...S} />
      <circle cx="22" cy="20" r="5.5" fill={C.sky} {...S} />
      {[0, 45, 90, 135].map((a) => (
        <path key={a} d="M22 10.5v19" stroke={C.woodDark} strokeWidth={1.3} transform={`rotate(${a} 22 20)`} />
      ))}
      <circle cx="22" cy="20" r="1.6" fill={C.woodDark} {...S} />
      <path d="M33 30V14h6v16" fill={C.stone} {...S} />
      <path d="M33 14h-6" stroke={C.wood} strokeWidth={2.4} strokeLinecap="round" />
    </>
  ),
  wildflowers: (
    <>
      {ground()}
      <path d="M8 30c0-3 1-5 2-7M16 30c0-4-1-6-2-8M24 30c0-4 1-7 2-9M33 30c0-3-1-6-2-8M40 30c0-3 1-5 2-6" stroke={C.forest} strokeWidth={1.2} strokeLinecap="round" fill="none" />
      {[
        [10, 22, C.roof], [14, 21, C.gold], [26, 20, C.blossom], [31, 21, C.lavender], [42, 23, C.cream],
        [20, 25, C.lavender], [36, 25, C.gold], [5, 26, C.blossom], [28, 26, C.roof],
      ].map(([x, y, fill]) => (
        <circle key={`${x}${y}`} cx={x as number} cy={y as number} r={2.2} fill={fill as string} {...S} />
      ))}
    </>
  ),
  shepherdsHut: (
    <>
      {ground()}
      <path d="M9 25V15c0-4 4-6 15-6s15 2 15 6v10Z" fill={C.wood} {...S} />
      <path d="M7 15c0-5 6-7.5 17-7.5S41 10 41 15" fill="none" stroke={INK} strokeWidth={1.2} />
      <path d="M7 15c0-5 6-7.5 17-7.5S41 10 41 15c-4-1.5-9-2-17-2s-13 .5-17 2Z" fill={C.meadow} {...S} />
      <rect x="14" y="16" width="5" height="4" rx="1" fill={C.glow} {...S} />
      <path d="M28 25v-8h5v8" fill={C.woodDark} {...S} />
      <circle cx="13" cy="27" r="3" fill={C.woodDark} {...S} />
      <circle cx="35" cy="27" r="3" fill={C.woodDark} {...S} />
      <path d="M33 7V3" stroke={C.stoneDark} strokeWidth={1.6} strokeLinecap="round" />
    </>
  ),
  // The Drystone Wall: its id is from when this was a bridge.
  stoneBridge: (
    <>
      {ground()}
      <path d="M3 31v-9c0-1.4 1-2 2.4-2h11.2c1.4 0 2.4.6 2.4 2v9Z" fill={C.stone} {...S} />
      <path d="M29 31v-9c0-1.4 1-2 2.4-2h11.2c1.4 0 2.4.6 2.4 2v9Z" fill={C.stone} {...S} />
      <path d="M3 25h16M3 28h16M8 20v5M14 20v5M6 25v3M11 25v3M16 25v3M8.5 28v3M13.5 28v3" stroke={C.stoneDark} strokeWidth={0.9} />
      <path d="M29 25h16M29 28h16M34 20v5M40 20v5M32 25v3M37 25v3M42 25v3M34.5 28v3M39.5 28v3" stroke={C.stoneDark} strokeWidth={0.9} />
      <path d="M4.4 19.6h13.2M30.4 19.6h13.2" stroke={C.stoneDark} strokeWidth={2.2} strokeLinecap="round" />
      <path d="M9 19.4c.8-.7 1.8-.7 2.6 0M36 19.4c.8-.7 1.8-.7 2.6 0" stroke={C.sage} strokeWidth={1.4} strokeLinecap="round" fill="none" />
      <path d="M20 21h8M20 24.5h8M20 28h8M20 28l8-7" stroke={C.woodLight} strokeWidth={1.4} strokeLinecap="round" />
      <path d="M19.5 31V17M28.5 31V17" stroke={C.woodDark} strokeWidth={2} strokeLinecap="round" />
    </>
  ),
  mushroomRing: (
    <>
      {ground(C.meadow)}
      {[
        [9, 27, 1], [17, 24, 0.8], [27, 24, 0.85], [37, 27, 1.05], [23, 29, 1.2],
      ].map(([x, y, k], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${k})`}>
          <path d="M-1 0v-4h2v4Z" fill={C.cream} {...S} />
          <path d="M-5 -4a5 4 0 0 1 10 0Z" fill={i % 2 ? C.roof : C.cream} {...S} />
          <circle cx="-1.6" cy="-5.6" r="0.9" fill={C.glow} />
          <circle cx="1.8" cy="-5" r="0.7" fill={C.glow} />
        </g>
      ))}
      <path d="M38 8a4 4 0 1 0 3 6 3.2 3.2 0 0 1-3-6Z" fill={C.cream} stroke={INK} strokeWidth={0.9} />
    </>
  ),
  woodcutter: (
    <>
      {ground()}
      <path d="M8 30V16h22v14Z" fill={C.wood} {...S} />
      <path d="M8 19.5h22M8 23h22M8 26.5h22" stroke={C.woodDark} strokeWidth={1} />
      <path d="M5 17 19 7l14 10Z" fill={C.sage} {...S} />
      <rect x="12" y="20" width="5" height="4.5" rx="1" fill={C.glow} {...S} />
      <path d="M22 30v-7h5v7" fill={C.woodDark} {...S} />
      <path d="M37 30v-4h6v4" fill={C.woodLight} {...S} />
      <path d="M40 26l2.6-4.4" stroke={C.stoneDark} strokeWidth={1.4} strokeLinecap="round" />
      <path d="M26 10V5h3v7" fill={C.stoneDark} {...S} />
    </>
  ),
  treetopWalk: (
    <>
      {ground()}
      <path d="M8 30V14M40 30V14" stroke={C.woodDark} strokeWidth={2} strokeLinecap="round" />
      <circle cx="8" cy="9" r="6.5" fill={C.meadow} {...S} />
      <circle cx="40" cy="9" r="6.5" fill={C.forest} {...S} />
      <path d="M5 16h7M37 16h7" stroke={C.woodDark} strokeWidth={2} strokeLinecap="round" />
      <path d="M11 16c6 5 20 5 26 0" stroke={C.woodLight} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <path d="M11 12c6 5 20 5 26 0" stroke={C.wood} strokeWidth={0.9} fill="none" />
      <path d="M17 17.6v-2.4M24 18.6v-2.6M31 17.6v-2.4" stroke={C.wood} strokeWidth={0.9} />
    </>
  ),
  keeperCottage: (
    <>
      {ground(C.sage)}
      <path d="M33 30l1.5-22h5L41 30Z" fill={C.cream} {...S} />
      <path d="M34.2 14h5.6M33.8 20h6.4" stroke={C.roof} strokeWidth={2.4} />
      <path d="M34.5 8h5l-2.5-3Z" fill={C.roof} {...S} />
      <path d="M8 30V19h18v11Z" fill={C.cream} {...S} />
      <path d="M6 19.5 17 12l11 7.5Z" fill={C.roof} {...S} />
      <rect x="11" y="22" width="4" height="4" rx="0.8" fill={C.glow} {...S} />
      <path d="M19 30v-6h4v6" fill={C.woodDark} {...S} />
      <path d="M22 14.5V11h2.4v5" fill={C.stone} {...S} />
    </>
  ),
  skyHarbour: (
    <>
      {cloud(4, 31)}
      {cloud(32, 32)}
      <path d="M2 26h18v3H2Z" fill={C.woodLight} {...S} />
      <path d="M6 29v4M15 29v4" stroke={C.woodDark} strokeWidth={1.4} strokeLinecap="round" />
      <path d="M22 24h20c-1 4-4 6-10 6s-9-2-10-6Z" fill={C.wood} {...S} />
      <path d="M41.5 24c1-2 2.6-3 4-3" stroke={C.gold} strokeWidth={1.6} strokeLinecap="round" fill="none" />
      <path d="M31 24V6" stroke={C.woodDark} strokeWidth={1.4} />
      <path d="M31 8c5 2 7 6 7 13h-7Z" fill={C.cream} {...S} />
      <path d="M31 13c3 1 5 2.6 6 5" stroke={C.roof} strokeWidth={1.2} fill="none" />
      <path d="M12 26V18" stroke={C.woodDark} strokeWidth={1.2} />
      <rect x="10.6" y="15" width="2.8" height="3" rx="0.6" fill={C.glow} {...S} />
    </>
  ),
  signalFire: (
    <>
      {ground(C.sage)}
      <path d="M16 30V20h16v10Z" fill={C.stone} {...S} />
      <path d="M16 24h16M21 20v4M27 24v6" stroke={C.stoneDark} strokeWidth={1} />
      <path d="M15 20l3-3h12l3 3Z" fill={C.woodDark} {...S} />
      <path d="M24 3c4 4 6 7 6 10a6 6 0 0 1-12 0c0-2 1-4 2.6-5.6.4 2 1.4 3 2.4 3 0-3 0-5 1-7.4Z" fill={C.gold} {...S} />
      <path d="M24 9c2 2 3 3.6 3 5a3 3 0 0 1-6 0c0-1.6 1.2-3 3-5Z" fill={C.roof} stroke="none" />
    </>
  ),
  boardwalkLoop: (
    <>
      {water('M2 26c4-8 40-8 44 0-4 8-40 8-44 0Z')}
      <path d="M8 26c3-5 29-5 32 0-3 5-29 5-32 0Z" fill="none" stroke={C.woodLight} strokeWidth={4} />
      <path d="M8 26c3-5 29-5 32 0-3 5-29 5-32 0Z" fill="none" stroke={INK} strokeWidth={0.6} strokeDasharray="1.2 2.2" />
      <path d="M22 26c1-1 3-1 4 0" stroke={C.cream} strokeWidth={1} fill="none" strokeLinecap="round" />
      <path d="M40 22V12M43 24V15M37 22v-8" stroke={C.forest} strokeWidth={1.2} strokeLinecap="round" />
      <path d="M40 12v-3" stroke={C.woodDark} strokeWidth={2} strokeLinecap="round" />
    </>
  ),
  reedBeds: (
    <>
      {water()}
      {[6, 10, 14, 30, 34, 38, 42].map(reed)}
      {[19, 23, 27].map(reed)}
      <path d="M10 15v-4M34 13v-4" stroke={C.woodDark} strokeWidth={2.4} strokeLinecap="round" />
    </>
  ),
  heronHide: (
    <>
      {water()}
      <path d="M13 30V20M35 30V20M17 30V21M31 30V21" stroke={C.woodDark} strokeWidth={1.6} strokeLinecap="round" />
      <path d="M11 21V11h26v10Z" fill={C.wood} {...S} />
      <path d="M15 15h18" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
      <path d="M9 12l16-6 14 6Z" fill={C.gold} {...S} />
      <path d="M38 21l2 9M41 21l2 9M38.5 24h3M39.2 27h3" stroke={C.woodLight} strokeWidth={1} />
    </>
  ),
  stoneCircle: (
    <>
      {ground(C.sage)}
      {[
        [6, 30, 4, 10], [14, 27, 4.4, 15], [24, 26, 5, 17], [34, 27, 4.4, 14], [42, 30, 4, 10],
      ].map(([x, y, w, h], i) => (
        <path key={i} d={`M${x - w / 2} ${y}l${w * 0.15} ${-h}c${w * 0.2} -1 ${w * 0.5} -1 ${w * 0.7} 0l${w * 0.15} ${h}Z`} fill={i % 2 ? C.stoneDark : C.stone} {...S} />
      ))}
      <path d="M22 18.5c1 .6 2 .6 3 0" stroke={C.sage} strokeWidth={1.6} strokeLinecap="round" />
    </>
  ),
  bothy: (
    <>
      {ground(C.sage)}
      <path d="M9 30V18h26v12Z" fill={C.stone} {...S} />
      <path d="M9 22h26M9 26h26M15 18v4M27 18v4M20 22v4M31 22v4M14 26v4" stroke={C.stoneDark} strokeWidth={0.9} />
      <path d="M6 19c3-6 11-9 16-9s13 3 16 9Z" fill={C.meadow} {...S} />
      <path d="M19 30v-6h5v6" fill={C.woodDark} {...S} />
      <rect x="27" y="23" width="4" height="3.4" rx="0.6" fill={C.glow} {...S} />
      <path d="M30 13V7h3.4v7" fill={C.stone} {...S} />
      <path d="M32 5c-1-1.4 0-2.6 1.4-2.6M34 3.5c1-.6 2.4-.2 2.6.8" stroke={C.stoneDark} strokeWidth={0.9} fill="none" strokeLinecap="round" />
      <path d="M38 30v-6h5v6" fill={C.woodDark} {...S} />
    </>
  ),
  summitCairn: (
    <>
      <path d="M2 32 16 18l8 5 8-9 14 18Z" fill={C.sage} {...S} />
      <ellipse cx="32" cy="12.6" rx="5" ry="2" fill={C.stoneDark} {...S} />
      <ellipse cx="32" cy="9.6" rx="4" ry="1.8" fill={C.stone} {...S} />
      <ellipse cx="32" cy="6.8" rx="3" ry="1.5" fill={C.stoneDark} {...S} />
      <ellipse cx="32" cy="4.4" rx="1.8" ry="1.2" fill={C.stone} {...S} />
      {cloud(6, 12)}
    </>
  ),
}

/** The picture for a restoration, done or not (a muted wash until it's done). */
export function BundleArt({ id, done, size = 56 }: { id: BundleId; done: boolean; size?: number }) {
  return (
    <svg
      viewBox="0 0 48 36"
      width={size}
      height={(size * 36) / 48}
      aria-hidden="true"
      className={`bundle-art ${done ? 'bundle-art--done' : ''}`}
    >
      {ART[id]}
    </svg>
  )
}
