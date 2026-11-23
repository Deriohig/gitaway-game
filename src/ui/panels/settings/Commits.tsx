import { useState } from 'react'
import { deviceTime } from '../../../game/clock'
import { unwatchRepository, watchRepository } from '../../../game/engine'
import { isOn } from '../../../game/features'
import { describeCheckProblem, describeGitError, type GitProblem } from '../../../integrations/gitProblem'
import { isDesktop, pickRepository } from '../../../integrations/localGit'
import { SOURCES, type ActivitySource, type Availability } from '../../../integrations/sources'
import { checkReposNow, forgetCheckProblem, useCheckProblems } from '../../../integrations/useGitWatcher'
import { useGame } from '../../../store/game'
import { Icon } from '../../Icon'
import { Section } from '../../Panel'

const STATUS: Record<Availability['state'], string> = {
  active: 'On',
  available: 'Not connected',
  'needs-desktop': 'Desktop app only',
  'not-built': 'Not available yet',
}

const shortDate = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** Why the last folder couldn't be added, or checked: what happened, what to do, and the command that fixes it. */
function GitProblemNote({ problem, onDismiss, testId = 'git-problem' }: { problem: GitProblem; onDismiss: () => void; testId?: string }) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(problem.command ?? '')
      setCopy('copied')
    } catch {
      setCopy('failed')
    }
  }
  return (
    <div className="git-problem" role="alert" data-testid={testId} data-kind={problem.kind}>
      <div className="git-problem__head">
        <strong data-testid={`${testId}-title`}>{problem.title}</strong>
        <button className="icon-btn icon-btn--ghost" onClick={onDismiss} aria-label="Dismiss" data-testid={`${testId}-dismiss`}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <p className="small" data-testid={`${testId}-detail`}>
        {problem.detail}
      </p>
      {problem.command && (
        <div className="git-problem__fix">
          <code data-testid={`${testId}-command`}>{problem.command}</code>
          <button className="btn btn--small" onClick={copyCommand} data-testid={`${testId}-copy`}>
            {copy === 'copied' ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
      {copy === 'failed' && <p className="muted small">Couldn't copy it. Select the command and copy it yourself.</p>}
    </div>
  )
}

/** Repositories picked in the desktop app, plus the buttons to add and check them. */
function LocalGitControls() {
  const repos = useGame((s) => s.game.repos)
  const run = useGame((s) => s.run)
  const fair = isOn('fairCounting')
  const checkProblems = useCheckProblems()
  const [picking, setPicking] = useState(false)
  const [checking, setChecking] = useState(false)
  // Stays until dismissed, replaced by the next problem, or a folder is added. `seq` gives each problem a fresh note.
  const [problem, setProblem] = useState<{ seq: number; problem: GitProblem } | null>(null)

  const add = async () => {
    // One folder dialog at a time.
    setPicking(true)
    try {
      const picked = await pickRepository()
      if (picked) {
        // Commit times are the device's, so the cursor is set by its clock (see engine.ts).
        run((s, now) => watchRepository(s, picked, now, deviceTime(now)))
        setProblem(null)
      }
    } catch (error) {
      setProblem((last) => ({ seq: (last?.seq ?? 0) + 1, problem: describeGitError(error) }))
    } finally {
      setPicking(false)
    }
  }

  const check = async () => {
    setChecking(true)
    try {
      await checkReposNow()
    } finally {
      setChecking(false)
    }
  }

  return (
    <>
      {repos.length > 0 && (
        <ul className="repos">
          {/* With fair counting (A7) the rest of the game calls a repository by its tree, so here the two are paired. */}
          {repos.map((r) => (
            <li key={r.path} title={r.path} data-testid={`repo-${r.name}`}>
              <span className="repos__name">
                <strong>{r.name}</strong> <span className="muted">{fair && <span data-testid={`repo-alias-${r.name}`}>· the {r.alias} tree · </span>}since {shortDate(r.addedAt)}</span>
              </span>
              <button className="icon-btn icon-btn--ghost" onClick={() => run((s) => unwatchRepository(s, r.path))} aria-label={`Stop watching ${r.name}`} data-testid={`remove-repo-${r.name}`}>
                <Icon name="close" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* With fair counting (A7) a failed check's toast names no folder, so the whole fix is here, by the folder's name. */}
      {fair &&
        repos.map((r) => {
          const error = checkProblems.get(r.path)
          if (error === undefined) return null
          return (
            <GitProblemNote key={`check-${r.path}`} problem={describeCheckProblem(r.name, error)} onDismiss={() => forgetCheckProblem(r.path)} testId={`check-problem-${r.name}`} />
          )
        })}
      <div className="btn-row">
        <button className="btn btn--small" onClick={add} disabled={picking} data-testid="add-repo">
          <Icon name="plus" size={16} /> Add repository…
        </button>
        {repos.length > 0 && (
          <button className="btn btn--small" onClick={check} disabled={checking} data-testid="check-repos">
            {checking ? 'Checking…' : 'Check now'}
          </button>
        )}
      </div>
      <p className="muted small repos__wsl" data-testid="wsl-hint">
        Projects in WSL work too: paste <code>{'\\\\wsl.localhost\\<distro>\\…'}</code> into the folder box.
      </p>
      {problem && <GitProblemNote key={problem.seq} problem={problem.problem} onDismiss={() => setProblem(null)} />}
      <p className="muted small repos__note">Reads only how many commits you made and when: never code, messages, file names or anything from remotes.</p>
    </>
  )
}

function SourceCard({ source }: { source: ActivitySource }) {
  const repos = useGame((s) => s.game.repos)
  const a = source.availability({ repos })
  const git = source.id === 'local-git' && a.state !== 'needs-desktop'
  const status = git && a.state === 'active' ? `Watching ${repos.length}` : STATUS[a.state]
  return (
    <li className={`source source--${a.state}`} data-testid={`source-${source.id}`}>
      <Icon name={source.id === 'manual' ? 'task' : 'branch'} size={22} />
      <div>
        <div className="source__title">
          <strong>{source.name}</strong>
          <span className="pill" data-testid={`source-${source.id}-status`}>
            {status}
          </span>
        </div>
        <p className="small">{source.description}</p>
        {git ? <LocalGitControls /> : <p className="muted small">{source.reads}</p>}
      </div>
    </li>
  )
}

/** Settings → Commits: where work is counted from. */
export function CommitsSettings() {
  const farmOnly = useGame((s) => s.game.settings.farmOnly)
  return (
    <Section title="Work tracking">
      <ul className="sources">
        {SOURCES.map((src) => (
          <SourceCard key={src.id} source={src} />
        ))}
      </ul>
      {!isDesktop() && <p className="hint">This browser version can't read local repositories, so Git tracking stays off rather than pretending.</p>}
      <p className="hint" data-testid="farm-only-hint">
        {farmOnly
          ? '"Just here for the farm" is on in General, so work and commits don\'t pay.'
          : 'No work to bring? Turn on "Just here for the farm" in General, and the farm pays more.'}
      </p>
    </Section>
  )
}
