import { useRef } from 'react'
import { useGame } from '../../../store/game'
import { Icon } from '../../Icon'
import { Section } from '../../Panel'

function exportFarm() {
  const { game } = useGame.getState()
  // Repository paths name the folders on this computer (and often the Windows
  // user), so a shared export keeps only the repository names.
  const copy = { ...game, repos: game.repos.map((r) => ({ name: r.name })) }
  const blob = new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `gitaway-${game.farmName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Settings → Data: privacy, export and starting over. */
export function DataSettings() {
  const farmName = useGame((s) => s.game.farmName)
  const canSave = useGame((s) => s.canSave)
  const reset = useGame((s) => s.reset)
  const dialog = useRef<HTMLDialogElement>(null)

  return (
    <Section title="Privacy">
      <ul className="privacy">
        <li>
          <Icon name="shield" size={20} /> No account, no analytics, no tracking. Gitaway makes no network requests.
        </li>
        <li>
          <Icon name="shield" size={20} /> Your farm, sessions and task names are stored in this browser on this device, and nowhere else: in IndexedDB, plus a short-lived backup in local storage while a save is still being written.
        </li>
        <li>
          <Icon name="shield" size={20} /> Clearing this site's data in your browser deletes the farm. Export a copy first if you'd like to keep it.
        </li>
      </ul>
      {!canSave && <p className="note">This browser is blocking storage, so progress will be lost when you close the tab.</p>}
      <div className="btn-row">
        <button className="btn btn--small" onClick={exportFarm} data-testid="export-farm">
          <Icon name="download" size={16} /> Export farm
        </button>
        <button className="btn btn--small btn--danger" onClick={() => dialog.current?.showModal()} data-testid="reset-farm">
          <Icon name="trash" size={16} /> Reset progress…
        </button>
      </div>

      <dialog ref={dialog} className="card dialog" aria-labelledby="reset-title" data-testid="reset-dialog">
        <h2 id="reset-title">Start over?</h2>
        <p>
          This erases <strong>{farmName}</strong> from this browser: coins, crops, buildings and history. It can't be undone.
        </p>
        <div className="btn-row">
          <button className="btn" onClick={() => dialog.current?.close()} autoFocus>
            Keep my farm
          </button>
          <button
            className="btn btn--danger"
            onClick={async () => {
              dialog.current?.close()
              await reset()
            }}
            data-testid="confirm-reset"
          >
            Erase and start over
          </button>
        </div>
      </dialog>
    </Section>
  )
}
