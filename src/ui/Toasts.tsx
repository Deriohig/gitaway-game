import { useEffect, useRef } from 'react'
import type { NoticeKind } from '../game/engine'
import { useGame, type Toast } from '../store/game'
import { Icon } from './Icon'

const ICON: Record<NoticeKind, string> = {
  reward: 'task',
  level: 'star',
  unlock: 'gift',
  animal: 'paw',
  crop: 'sprout',
  session: 'laptop',
  info: 'sparkle',
  warn: 'info',
}

const LIFETIME = 6500

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useGame((s) => s.dismissToast)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const start = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => dismiss(toast.id), toast.kind === 'level' ? LIFETIME * 1.5 : LIFETIME)
  }
  useEffect(() => {
    start()
    return () => clearTimeout(timer.current)
  }, [])
  return (
    <li className={`card toast toast--${toast.kind}`} onMouseEnter={() => clearTimeout(timer.current)} onMouseLeave={start}>
      <span className="toast__icon">
        <Icon name={ICON[toast.kind]} size={24} />
      </span>
      <div className="toast__text">
        <strong>{toast.title}</strong>
        {toast.detail && <span>{toast.detail}</span>}
      </div>
      <button className="icon-btn icon-btn--ghost toast__close" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
        <Icon name="close" size={14} />
      </button>
    </li>
  )
}

/**
 * Notes that come and go. Quiet mode (A6) never gets here: the store keeps
 * only the warnings, which answer a click, while the journal keeps it all.
 * The compact HUD shows just the newest (`limit`).
 */
export function Toasts({ limit }: { limit?: number }) {
  const toasts = useGame((s) => s.toasts)
  const shown = limit ? toasts.slice(-limit) : toasts
  return (
    <ol className={limit ? 'toasts toasts--compact' : 'toasts'} aria-live="polite" aria-label="Notifications" data-testid="toasts">
      {shown.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </ol>
  )
}
