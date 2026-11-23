const pad = (n: number) => String(n).padStart(2, '0')

/** 01:24:36 */
export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

/** "12 min", "1 h 5 min", "under a minute" */
export function duration(ms: number): string {
  const minutes = Math.ceil(Math.max(0, ms) / 60_000)
  if (minutes <= 1) return ms <= 0 ? 'now' : 'under a minute'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}

export const num = (n: number) => n.toLocaleString('en-GB')

export function hours(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = minutes / 60
  return `${h >= 10 ? Math.round(h) : Math.round(h * 10) / 10} h`
}
