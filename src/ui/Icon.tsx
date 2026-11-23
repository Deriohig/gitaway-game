import type { JSX } from 'react'

// Small illustrated icons, drawn for Gitaway. Two-tone fills from the palette
// with a warm ink outline, all on a 24×24 grid.

const INK = '#403D35'
const S = { stroke: INK, strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

const ICONS: Record<string, JSX.Element> = {
  coin: (
    <>
      <circle cx="12" cy="12" r="8.5" fill="#E8BD72" {...S} />
      <circle cx="12" cy="12" r="5.6" fill="none" stroke="#B98E45" strokeWidth="1.2" />
      <path d="M12 15.2v-4.4m0 0c0-1.5 1.1-2.4 2.5-2.4 0 1.5-1 2.4-2.5 2.4Zm0 1c0-1.3-.9-2-2.1-2 0 1.3.9 2 2.1 2Z" fill="#9CAF88" stroke="#7A5A2E" strokeWidth="1" strokeLinejoin="round" />
    </>
  ),
  seed: (
    <>
      <path d="M6 7.5h12l-1 12a1.5 1.5 0 0 1-1.5 1.4h-7A1.5 1.5 0 0 1 7 19.5Z" fill="#FFF8EC" {...S} />
      <path d="M6 7.5 7.2 4h9.6L18 7.5" fill="#C98268" {...S} />
      <path d="M12 18v-4.2m0 0c0-1.7 1.2-2.7 2.8-2.7 0 1.7-1.2 2.7-2.8 2.7Zm0 .9c0-1.4-1-2.2-2.4-2.2 0 1.4 1 2.2 2.4 2.2Z" fill="#9CAF88" stroke="#526E58" strokeWidth="1.1" strokeLinejoin="round" />
    </>
  ),
  wood: (
    <>
      <path d="M4 9.5c0-1.4 1.1-2.5 2.5-2.5h11v10h-11A2.5 2.5 0 0 1 4 14.5Z" fill="#A9825D" {...S} />
      <ellipse cx="17.5" cy="12" rx="2.6" ry="5" fill="#E2C79E" {...S} />
      <ellipse cx="17.5" cy="12" rx="1.1" ry="2.2" fill="none" stroke="#A9825D" strokeWidth="1" />
      <path d="M7.5 10.5h5M9 13.5h4.5" stroke="#7D5F45" strokeWidth="1.1" strokeLinecap="round" />
    </>
  ),
  gear: (
    <>
      <path d="M12 3.6l1.4 1.9 2.3-.5.6 2.3 2.3.7-.5 2.3 1.9 1.4-1.9 1.4.5 2.3-2.3.7-.6 2.3-2.3-.5L12 20.4l-1.4-1.9-2.3.5-.6-2.3-2.3-.7.5-2.3L4 12.3l1.9-1.4-.5-2.3 2.3-.7.6-2.3 2.3.5Z" fill="#E7DCC8" {...S} />
      <circle cx="12" cy="12" r="2.8" fill="#FFF8EC" {...S} />
    </>
  ),
  sprout: (
    <>
      <path d="M12 20v-7" {...S} fill="none" />
      <path d="M12 13c0-3.4 2.4-5.6 6-5.6 0 3.4-2.4 5.6-6 5.6Z" fill="#9CAF88" {...S} />
      <path d="M12 14.5c0-2.8-2-4.6-5-4.6 0 2.8 2 4.6 5 4.6Z" fill="#7D9B70" {...S} />
      <path d="M7 20h10" {...S} fill="none" />
    </>
  ),
  farm: (
    <>
      <path d="M5 11.5V19.5h14V11.5" fill="#FFF8EC" {...S} />
      <path d="M3.5 12 12 4.8l8.5 7.2" fill="#C98268" {...S} />
      <path d="M10 19.5v-4.6h4v4.6" fill="#A9825D" {...S} />
      <path d="M15.6 7.8V5.3h2v4.1" fill="#E7DCC8" {...S} />
    </>
  ),
  garden: (
    <>
      <path d="M3.5 17.5c2.5-2 14.5-2 17 0v2a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1Z" fill="#8A6B55" {...S} />
      <path d="M12 16v-5" {...S} fill="none" />
      <path d="M12 11c0-2.8 2-4.6 5-4.6 0 2.8-2 4.6-5 4.6Z" fill="#9CAF88" {...S} />
      <path d="M12 12.5c0-2.2-1.6-3.6-4-3.6 0 2.2 1.6 3.6 4 3.6Z" fill="#7D9B70" {...S} />
    </>
  ),
  shop: (
    <>
      <path d="M5 11v8.5h14V11" fill="#FFF8EC" {...S} />
      <path d="M4 6.5h16l1 4a2.2 2.2 0 0 1-4.3.5 2.2 2.2 0 0 1-4.4 0 2.2 2.2 0 0 1-4.4 0A2.2 2.2 0 0 1 3 10.5Z" fill="#C98268" {...S} />
      <path d="M8.3 6.5 7.6 11M12 6.5V11m3.7-4.5.7 4.5" stroke="#FFF8EC" strokeWidth="1.3" />
      <path d="M9.5 19.5v-4.2h5v4.2" fill="#91B7C8" {...S} />
    </>
  ),
  inventory: (
    <>
      <path d="M4 10h16l-1.6 8.6a1.8 1.8 0 0 1-1.8 1.4H7.4a1.8 1.8 0 0 1-1.8-1.4Z" fill="#E2C79E" {...S} />
      <path d="M8 10a4 4 0 0 1 8 0" fill="none" {...S} />
      <path d="M8 13.5l.6 4M12 13.5v4M16 13.5l-.6 4" stroke="#A9825D" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="9.5" cy="9" r="1.6" fill="#C98268" {...S} />
      <circle cx="13.2" cy="8.6" r="1.4" fill="#E8BD72" {...S} />
    </>
  ),
  progress: (
    <>
      <path d="M3 19.5c3-6 6.5-9 9-9s6 3 9 9Z" fill="#9CAF88" {...S} />
      <path d="M12 10.5V3.8" {...S} fill="none" />
      <path d="M12 4l5 1.8-5 1.8Z" fill="#E8BD72" {...S} />
      <path d="M8.5 19.5c.8-1.6 2.1-3 3.5-3.6" stroke="#FFF8EC" strokeWidth="1.3" strokeLinecap="round" fill="none" />
    </>
  ),
  laptop: (
    <>
      <rect x="5" y="5.5" width="14" height="9.5" rx="1.4" fill="#FFF8EC" {...S} />
      <path d="M8 9.5l2 1.6-2 1.6M12 12.7h3" stroke="#526E58" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M3 17h18l-1 2H4Z" fill="#E7DCC8" {...S} />
    </>
  ),
  task: (
    <>
      <rect x="4.5" y="4.5" width="15" height="15" rx="3.5" fill="#FFF8EC" {...S} />
      <path d="M8.5 12.2l2.4 2.4 4.8-5" stroke="#526E58" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  check: <path d="M6 12.5l4 4 8-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
  close: <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />,
  plus: <path d="M12 6v12M6 12h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />,
  minus: <path d="M6 12h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />,
  chevronDown: <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
  chevronUp: <path d="M7 14l5-5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
  edit: <path d="M14.5 6.5l3 3M5.5 18.5l1-4 9-9 3 3-9 9Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
  play: <path d="M9 7.2v9.6a.6.6 0 0 0 .9.5l7.4-4.8a.6.6 0 0 0 0-1L9.9 6.7a.6.6 0 0 0-.9.5Z" fill="currentColor" />,
  stop: <rect x="7.5" y="7.5" width="9" height="9" rx="1.8" fill="currentColor" />,
  star: (
    <path d="M12 3.8l2.3 4.9 5.3.6-3.9 3.6 1 5.3L12 15.6l-4.7 2.6 1-5.3-3.9-3.6 5.3-.6Z" fill="#E8BD72" {...S} />
  ),
  sparkle: (
    <path d="M12 3.5c.6 4.1 2.4 5.9 6.5 6.5-4.1.6-5.9 2.4-6.5 6.5-.6-4.1-2.4-5.9-6.5-6.5 4.1-.6 5.9-2.4 6.5-6.5Z" fill="#E8BD72" {...S} />
  ),
  gift: (
    <>
      <rect x="4.5" y="9.5" width="15" height="10" rx="1.5" fill="#91B7C8" {...S} />
      <path d="M3.8 7.5h16.4v3H3.8Z" fill="#BFD7DE" {...S} />
      <path d="M12 7.5v12" stroke="#C98268" strokeWidth="2.2" />
      <path d="M12 7.3c-1-2.6-4.6-3.1-4.6-1 0 1.3 2.4 1.2 4.6 1Zm0 0c1-2.6 4.6-3.1 4.6-1 0 1.3-2.4 1.2-4.6 1Z" fill="#C98268" {...S} />
    </>
  ),
  paw: (
    <>
      <ellipse cx="12" cy="15.5" rx="4" ry="3.4" fill="#E2C79E" {...S} />
      <circle cx="7" cy="10.5" r="1.8" fill="#E2C79E" {...S} />
      <circle cx="10" cy="7.3" r="1.8" fill="#E2C79E" {...S} />
      <circle cx="14" cy="7.3" r="1.8" fill="#E2C79E" {...S} />
      <circle cx="17" cy="10.5" r="1.8" fill="#E2C79E" {...S} />
    </>
  ),
  lock: (
    <>
      <rect x="6" y="10.5" width="12" height="9" rx="2" fill="#E7DCC8" {...S} />
      <path d="M8.8 10.5V8a3.2 3.2 0 0 1 6.4 0v2.5" fill="none" {...S} />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" fill="#E8BD72" {...S} />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M6 18l1.4-1.4M16.6 7.4 18 6" {...S} fill="none" />
    </>
  ),
  moon: <path d="M15.5 4.5a7.5 7.5 0 1 0 4 13.4A8 8 0 0 1 15.5 4.5Z" fill="#BFD7DE" {...S} />,
  sound: (
    <>
      <path d="M4.5 9.5h3l4-3.5v12l-4-3.5h-3Z" fill="#E7DCC8" {...S} />
      <path d="M15 9a4 4 0 0 1 0 6M17.5 6.8a7 7 0 0 1 0 10.4" {...S} fill="none" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.8l7 2.6v5.2c0 4.3-3 7.4-7 8.6-4-1.2-7-4.3-7-8.6V6.4Z" fill="#9CAF88" {...S} />
      <path d="M9 12l2.2 2.2L15.4 10" stroke="#FFF8EC" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  branch: (
    <>
      <path d="M7 5.5v13M7 15c0-4 10-3 10-7.5" {...S} fill="none" />
      <circle cx="7" cy="5.5" r="2" fill="#FFF8EC" {...S} />
      <circle cx="7" cy="18.5" r="2" fill="#FFF8EC" {...S} />
      <circle cx="17" cy="6.5" r="2" fill="#9CAF88" {...S} />
    </>
  ),
  download: <path d="M12 4.5v10m0 0-4-4m4 4 4-4M5 17.5v1.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
  trash: <path d="M5.5 7.5h13M10 7.5V5.5h4v2m-7 0 .8 11a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4l.8-11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 11v5.5M12 7.8v.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  question: (
    <>
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6M12 16.8v.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </>
  ),
  basket: (
    <>
      <path d="M4 11h16l-1.8 8a1.5 1.5 0 0 1-1.5 1.2H7.3A1.5 1.5 0 0 1 5.8 19Z" fill="#E2C79E" {...S} />
      <path d="M8 11 10.5 5M16 11l-2.5-6" {...S} fill="none" />
    </>
  ),
  journal: (
    <>
      <path d="M5 4.5h11a2 2 0 0 1 2 2v13.5H7a2 2 0 0 1-2-2Z" fill="#C98268" {...S} />
      <path d="M5 18a2 2 0 0 1 2-2h11" fill="none" {...S} />
      <path d="M8.5 8h6M8.5 11h4" stroke="#FFF8EC" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  island: (
    <>
      <path d="M3.5 12.5c2-2.2 15-2.2 17 0l-2.5 2.8-6 5.7-6-5.7Z" fill="#B79C86" {...S} />
      <path d="M3.5 12.5c3-3 14-3 17 0" fill="#9CAF88" {...S} />
      <path d="M15 10.8V8" {...S} fill="none" />
      <circle cx="15" cy="6.4" r="2.4" fill="#7D9B70" {...S} />
      <path d="M6.6 10.9V8.6l1.8-1.5 1.8 1.5v2.3" fill="#FFF8EC" {...S} />
    </>
  ),
  letter: (
    <>
      <rect x="3.5" y="6" width="17" height="12.5" rx="1.6" fill="#FFF8EC" {...S} />
      <path d="M4 7l8 6 8-6" fill="none" {...S} />
    </>
  ),
  stamp: (
    <>
      <path d="M5 4h14v16H5Z" fill="#FFF8EC" stroke={INK} strokeWidth="1.4" strokeDasharray="1.6 1.2" />
      <rect x="7.5" y="6.5" width="9" height="9" rx="1" fill="#91B7C8" {...S} />
      <path d="M8.6 15.2l2.6-3.2 1.6 1.7 1.5-2.1 1.5 3.6Z" fill="#7D9B70" />
    </>
  ),
  fish: (
    <>
      <path d="M3.5 12c2.5-4 8.5-5 12-1.5L20 7.5v9l-4.5-3C12 17 6 16 3.5 12Z" fill="#91B7C8" {...S} />
      <circle cx="7.5" cy="11.4" r=".9" fill={INK} />
    </>
  ),
  hammer: (
    <>
      <path d="M12.6 10.8 5.4 18a1.4 1.4 0 0 0 2 2l7.2-7.2" fill="#C29E76" {...S} />
      <path d="M11.2 6.6l3-3 6.2 6.2-3 3Z" fill="#B5AFA3" {...S} />
    </>
  ),
  bird: (
    <>
      <path d="M4 14c0-4 3.4-6.5 7-6.5.9-2 2.5-3 4.4-3 2.2 0 3.6 1.6 3.6 3.2l2 .8-2 .8c0 5-4 8.7-9 8.7-3.5 0-6-1.4-6-4Z" fill="#C98268" {...S} />
      <circle cx="16" cy="7.8" r=".8" fill={INK} />
      <path d="M8 13.5c2 1 4.5 1 6.5-.5" stroke="#A9654F" strokeWidth="1.2" strokeLinecap="round" fill="none" />
    </>
  ),
  camera: (
    <>
      <path d="M8.5 7.5 10 5h4l1.5 2.5" fill="#E7DCC8" {...S} />
      <rect x="3.5" y="7.5" width="17" height="12" rx="2" fill="#E7DCC8" {...S} />
      <circle cx="12" cy="13.5" r="3.6" fill="#91B7C8" {...S} />
    </>
  ),
  pot: (
    <>
      <path d="M5 10h14v6.5a3.5 3.5 0 0 1-3.5 3.5h-7A3.5 3.5 0 0 1 5 16.5Z" fill="#C98268" {...S} />
      <path d="M3 11.5h2M19 11.5h2M4.5 10h15" {...S} fill="none" />
      <path d="M10 7c-.8-1 .8-1.6 0-2.8M14 7c-.8-1 .8-1.6 0-2.8" stroke="#91B7C8" strokeWidth="1.3" strokeLinecap="round" fill="none" />
    </>
  ),
}

export type IconName = keyof typeof ICONS

export function Icon({ name, size = 20, className, title }: { name: IconName | string; size?: number; className?: string; title?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {ICONS[name] ?? ICONS.sparkle}
    </svg>
  )
}
