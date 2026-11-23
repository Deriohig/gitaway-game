// Where work activity can come from. Manual sessions and tasks are built in;
// everything else sits behind this boundary so it can be added later without
// touching the game rules. Nothing here talks to the network.

import type { GameState } from '../game/state'
import { isDesktop } from './localGit'

export type SourceId = 'manual' | 'local-git' | 'github' | 'gitlab'

/** The only thing a source may ever report: counts and times, never content. */
export interface ActivitySignal {
  source: SourceId
  kind: 'commit' | 'task'
  count: number
  at: number
}

export type Availability =
  | { state: 'active' }
  /** Ready to use here, but nothing is connected yet. */
  | { state: 'available' }
  /** Needs the desktop runtime, which can read selected repositories locally. */
  | { state: 'needs-desktop' }
  /** Planned; would use the provider's official OAuth app with read-only scopes. */
  | { state: 'not-built' }

export interface ActivitySource {
  id: SourceId
  name: string
  description: string
  /** Plain-language list of exactly what the source reads. */
  reads: string
  availability: (game: Pick<GameState, 'repos'>) => Availability
  /** Starts listening. Returns a function that stops it. */
  connect?: (emit: (signal: ActivitySignal) => void) => () => void
}

export const SOURCES: ActivitySource[] = [
  {
    id: 'manual',
    name: 'Manual sessions and tasks',
    description: 'Start and end work sessions yourself, and log tasks as you finish them.',
    reads: 'Only what you enter here. Task names stay on this device.',
    availability: () => ({ state: 'active' }),
  },
  {
    id: 'local-git',
    name: 'Local Git activity',
    description: 'Count commits in repositories you pick, to add small rewards.',
    reads: 'Commit counts and times only: never code, diffs, messages, file names or credentials.',
    availability: (game) => {
      if (!isDesktop()) return { state: 'needs-desktop' }
      return game.repos.length ? { state: 'active' } : { state: 'available' }
    },
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Optional, read-only, and disconnectable at any time.',
    reads: 'Would read event counts through the official GitHub app permissions. Not available yet.',
    availability: () => ({ state: 'not-built' }),
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    description: 'Optional, read-only, and disconnectable at any time.',
    reads: 'Would read event counts through official GitLab OAuth scopes. Not available yet.',
    availability: () => ({ state: 'not-built' }),
  },
]
