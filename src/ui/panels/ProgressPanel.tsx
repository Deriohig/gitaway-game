import { COMMITS, SESSION, TASKS } from '../../game/config'
import { landOwned } from '../../game/engine'
import { isOn } from '../../game/features'
import { levelProgress, nextUnlock } from '../../game/progression'
import { localDateKey } from '../../game/state'
import { useGame } from '../../store/game'
import { FieldNote } from '../FieldNote'
import { hours, num } from '../format'
import { Icon } from '../Icon'
import { Panel, Section } from '../Panel'
import { CottageCard } from './progress/CottageCard'
import { openWhatCounts } from './settings/WhatCounts'

const RETIREMENT_LEVEL = 10

export function ProgressPanel() {
  const game = useGame((s) => s.game)
  const p = levelProgress(game.xp)
  const next = nextUnlock(p.level)
  const tracksCommits = game.repos.length > 0 || game.stats.commits > 0
  const harvests = Object.values(game.stats.harvested).reduce((a, b) => a + (b ?? 0), 0)

  const milestones = [
    { done: game.stats.sessions > 0, label: 'Clock in for the first time' },
    { done: harvests > 0, label: 'Harvest your first crop' },
    { done: game.stats.tasks >= 10, label: 'Log 10 finished tasks' },
    { done: game.owned.windmill > 0, label: 'Build the windmill' },
    { done: game.stats.sessionMinutes >= 600, label: 'Focus for 10 hours in total' },
    { done: landOwned(game) > 0, label: 'Claim a second island' },
    { done: harvests >= 100, label: 'Harvest 100 crops' },
    { done: p.level >= RETIREMENT_LEVEL, label: 'Become an Islander (level 10)' },
  ]

  return (
    <Panel title="Progress" icon="progress" testId="panel-progress">
      <div className="level-card">
        <div className="level-card__badge">
          <Icon name="star" size={28} />
          <strong>{p.level}</strong>
        </div>
        <div>
          <div className="eyebrow">Farm level</div>
          <strong className="display">{p.title}</strong>
          <div className="bar">
            <span style={{ width: `${Math.round(p.fraction * 100)}%` }} />
          </div>
          <div className="muted small">
            {num(p.span - p.into)} XP to level {p.level + 1}
          </div>
        </div>
      </div>
      {next && (
        <p className="next-unlock">
          <Icon name="gift" size={18} /> Level {next.level} brings {next.names.join(', ')}.
        </p>
      )}

      <CottageCard />

      <Section title="Today">
        {isOn('fairCounting') ? <FairToday tracksCommits={tracksCommits} /> : <MeteredToday tracksCommits={tracksCommits} />}
      </Section>

      <Section title="So far">
        <ul className="stats-row">
          <li>
            <strong>{hours(game.stats.sessionMinutes)}</strong>
            <span>focused</span>
          </li>
          <li>
            <strong>{game.stats.tasks}</strong>
            <span>tasks</span>
          </li>
          {game.stats.commits > 0 && (
            <li data-testid="stat-commits">
              <strong>{num(game.stats.commits)}</strong>
              <span>commits</span>
            </li>
          )}
          <li>
            <strong>{harvests}</strong>
            <span>harvests</span>
          </li>
          <li>
            <strong>{num(game.stats.coinsEarned)}</strong>
            <span>coins earned</span>
          </li>
        </ul>
      </Section>

      <Section title="Milestones">
        <ul className="milestones">
          {milestones.map((m) => (
            <li key={m.label} className={m.done ? 'is-done' : ''}>
              <span className="milestones__check">{m.done && <Icon name="check" size={14} />}</span>
              {m.label}
            </li>
          ))}
        </ul>
      </Section>
    </Panel>
  )
}

/** What today has earned so far, if it was this game day. */
function useToday() {
  const game = useGame((s) => s.game)
  const now = useGame((s) => s.now)
  return game.daily.date === localDateKey(now) ? game.daily : { sessionMinutes: 0, tasks: [] as string[], commits: 0 }
}

/** Today's meters, each against its daily cap: the Progress panel as it is without fair counting. */
function MeteredToday({ tracksCommits }: { tracksCommits: boolean }) {
  const today = useToday()
  return (
    <>
      <ul className="meter-list">
        <li>
          <span>Focus time</span>
          <span className="bar bar--thin">
            <span style={{ width: `${Math.min(100, (today.sessionMinutes / SESSION.dailyMinuteCap) * 100)}%` }} />
          </span>
          <span className="muted small">
            {hours(today.sessionMinutes)} / {hours(SESSION.dailyMinuteCap)}
          </span>
        </li>
        <li>
          <span>Tasks</span>
          <span className="bar bar--thin">
            <span style={{ width: `${(today.tasks.length / TASKS.dailyLimit) * 100}%` }} />
          </span>
          <span className="muted small">
            {today.tasks.length} / {TASKS.dailyLimit}
          </span>
        </li>
        {tracksCommits && (
          <li data-testid="today-commits">
            <span>Commits</span>
            <span className="bar bar--thin">
              <span style={{ width: `${Math.min(100, (today.commits / COMMITS.dailyLimit) * 100)}%` }} />
            </span>
            <span className="muted small">
              {today.commits} / {COMMITS.dailyLimit}
            </span>
          </li>
        )}
      </ul>
      <p className="hint">Rewards cap out each day so nobody has to overdo it. Days off cost nothing.</p>
    </>
  )
}

/**
 * Fair counting (A7): what today brought, in plain amounts with no "x / y"
 * and no bars to fill; near or at a cap the field says so in words, and the
 * rules are a click away in Settings → What counts.
 */
function FairToday({ tracksCommits }: { tracksCommits: boolean }) {
  const today = useToday()
  const tasks = today.tasks.length
  return (
    <>
      <ul className="stats-row" data-testid="today">
        <li data-testid="today-focus">
          <strong>{hours(today.sessionMinutes)}</strong>
          <span>focused</span>
        </li>
        <li data-testid="today-tasks">
          <strong>{tasks}</strong>
          <span>{tasks === 1 ? 'task' : 'tasks'}</span>
        </li>
        {tracksCommits && (
          <li data-testid="today-commits">
            <strong>{num(today.commits)}</strong>
            <span>{today.commits === 1 ? 'commit' : 'commits'}</span>
          </li>
        )}
      </ul>
      <FieldNote which={tracksCommits ? ['focus', 'tasks', 'commits'] : ['focus', 'tasks']} />
      <p className="hint today-hint">
        Each day's rewards rest once the field is full, so nobody has to overdo it. Days off cost nothing.{' '}
        <button className="link" onClick={openWhatCounts} data-testid="open-what-counts">
          What counts
        </button>
      </p>
    </>
  )
}
