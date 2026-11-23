import { useEffect, useRef, type ReactNode } from 'react'
import { useGame } from '../store/game'
import { Icon } from './Icon'

/** A drawer that slides in over the edge of the world, never covering all of it. */
export function Panel({ title, icon, children, testId }: { title: string; icon: string; children: ReactNode; testId: string }) {
  const close = useGame((s) => s.openPanel)
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('h2')?.focus()
    return () => previous?.focus?.()
  }, [])
  return (
    <aside ref={ref} className="card panel" aria-labelledby={`${testId}-title`} data-testid={testId}>
      <header className="panel__head">
        <Icon name={icon} size={30} />
        <h2 id={`${testId}-title`} tabIndex={-1}>
          {title}
        </h2>
        <button className="icon-btn icon-btn--ghost" onClick={() => close(null)} aria-label={`Close ${title.toLowerCase()}`} data-testid="close-panel">
          <Icon name="close" size={18} />
        </button>
      </header>
      <div className="panel__body">{children}</div>
    </aside>
  )
}

/**
 * A row of tabs. A `sealed` tab carries a small seal after its label, never a number: its text stays the label, and
 * its accessible name says "unread".
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { id: T; label: string; sealed?: boolean }[]
  value: T
  onChange: (id: T) => void
  label: string
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          aria-label={t.sealed ? `${t.label}, unread` : undefined}
          className={`tab ${value === t.id ? 'is-active' : ''}`}
          onClick={() => onChange(t.id)}
          data-testid={`tab-${t.id}`}
          data-sealed={t.sealed ? 'true' : undefined}
        >
          {t.label}
          {t.sealed && <span className="tab__seal" aria-hidden="true" />}
        </button>
      ))}
    </div>
  )
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="section">
      <div className="section__head">
        <h3>{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}
