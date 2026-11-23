import { useMemo } from 'react'
import { rng } from './random'

// The far distance, painted rather than modelled: layered mountains fading
// into the haze, the sun or moon, and stars at night. Colours follow the
// time of day through CSS variables set by DayCycle.

export function SkyArt() {
  const stars = useMemo(() => {
    const r = rng(8)
    return Array.from({ length: 140 }, () => {
      const size = r() > 0.85 ? 2 : 1
      return `${Math.round(r() * 2400)}px ${Math.round(r() * 520)}px 0 ${size === 2 ? 0.5 : 0}px rgba(255, 246, 226, ${(0.5 + r() * 0.5).toFixed(2)})`
    }).join(', ')
  }, [])
  return (
    <div className="sky-art" aria-hidden="true">
      <div className="sky-art__stars" style={{ boxShadow: stars }} />
      <div className="sky-art__sun" />
      <div className="sky-art__moon" />
      <svg className="sky-art__mountains" viewBox="0 0 1600 400" preserveAspectRatio="xMidYMax slice">
        <path
          className="sky-art__far"
          d="M0 400V262Q70 214 150 236T318 176Q392 120 466 168T640 204Q722 140 798 118Q858 100 922 150T1078 192Q1160 128 1242 152T1418 204Q1504 168 1600 214V400Z"
        />
        <path
          className="sky-art__snow"
          d="M766 132Q798 118 828 108Q858 100 890 128Q866 122 846 132Q826 124 808 136Q788 128 766 132ZM436 150Q466 134 494 146Q478 146 466 154Q452 146 436 150Z"
        />
        <path
          className="sky-art__near"
          d="M0 400V304Q110 254 214 282T420 262Q516 212 604 252T784 290Q896 232 1000 262T1202 250Q1300 208 1404 262T1600 272V400Z"
        />
      </svg>
    </div>
  )
}
