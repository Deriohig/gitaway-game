import { useEffect, useRef } from 'react'
import { useGame } from '../../../store/game'
import { Section } from '../../Panel'
import { WHAT_COUNTS_INTRO, whatCountsRules } from './whatCountsRules'

/** Set by `openWhatCounts`, so the page scrolls itself into view as Settings opens. */
let asked = false

/** Opens Settings at What counts, where every rule is written down. */
export function openWhatCounts() {
  asked = true
  useGame.getState().openPanel('settings')
}

/**
 * Settings → What counts (A7): every rule, written from config so it can't
 * drift (see whatCountsRules.ts). Shown while fair counting is on (surfaces.ts).
 */
export function WhatCountsSettings() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!asked) return
    asked = false
    ref.current?.closest('.section')?.scrollIntoView({ block: 'start' })
  }, [])
  return (
    <Section title="What counts">
      <div className="what-counts" id="what-counts" ref={ref} data-testid="what-counts">
        <p className="muted small">{WHAT_COUNTS_INTRO}</p>
        {whatCountsRules().map((rule) => (
          <section key={rule.id} className="what-counts__rule" aria-labelledby={`what-counts-${rule.id}-title`} data-testid={`what-counts-${rule.id}`}>
            <h4 id={`what-counts-${rule.id}-title`}>{rule.title}</h4>
            <ul>
              {rule.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Section>
  )
}
