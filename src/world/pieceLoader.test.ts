import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadManifest } from './Asset'
import { ISLES } from './layout'
import { loadPiece, needPiece, piecesToWaitFor, usePieceStore } from './pieceLoader'

// A piece the farm needs whose files don't arrive is drawn from its procedural stand-in a few seconds later, so one
// stalled request can't keep the farm, or a piece just bought, from being drawn.

vi.mock('./Asset', () => ({ loadManifest: vi.fn() }))
vi.mock('three-stdlib', async () => {
  const THREE = await import('three')
  return {
    GLTFLoader: class {
      loadAsync() {
        const scene = new THREE.Group()
        scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()))
        return Promise.resolve({ scene })
      }
    },
  }
})

type Assets = Awaited<ReturnType<typeof loadManifest>>

/** A manifest listing a baked piece, with a 2 x 2 height grid. */
const listing = (id: string) =>
  ({
    [`piece_${id}`]: { file: `piece_${id}.glb`, status: 'ready', height: { file: `piece_${id}.height.bin`, origin: [0, 0], spacing: 1, size: [2, 2] } },
  }) as unknown as Assets

/** Whether a promise has settled yet, and with what. */
const peek = <T,>(p: Promise<T>) => Promise.race([p, Promise.resolve('still waiting' as const)])

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(16) })))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('a piece whose files stall', () => {
  it('is drawn from its stand-in eight seconds after the farm needs it, and not before', async () => {
    vi.mocked(loadManifest).mockReturnValue(new Promise(() => {}))
    const load = loadPiece('grove') // in the background, it can take as long as it likes
    await vi.advanceTimersByTimeAsync(20_000)
    expect(await peek(load)).toBe('still waiting')
    expect(needPiece('grove')).toBe(load) // bought: from now it has eight seconds
    await vi.advanceTimersByTimeAsync(7900)
    expect(await peek(load)).toBe('still waiting')
    await vi.advanceTimersByTimeAsync(200)
    expect(await peek(load)).toBe('procedural')
    expect(usePieceStore.getState().sources.grove).toBe('procedural')
    expect(ISLES.grove.island.source).toBe('procedural')
  })

  it('keeps its stand-in when the files turn up after all, so nothing on it moves', async () => {
    let arrive: (assets: Assets) => void = () => {}
    vi.mocked(loadManifest).mockReturnValue(new Promise((resolve) => (arrive = resolve)))
    const load = needPiece('islet')
    await vi.advanceTimersByTimeAsync(8100)
    expect(await peek(load)).toBe('procedural')
    arrive(listing('islet'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(usePieceStore.getState().sources.islet).toBe('procedural')
    expect(ISLES.islet.island.source).toBe('procedural')
  })
})

it('draws a piece whose files arrive in time baked, its time limit then changing nothing', async () => {
  vi.mocked(loadManifest).mockResolvedValue(listing('meadow'))
  const load = needPiece('meadow')
  await vi.advanceTimersByTimeAsync(10)
  expect(await peek(load)).toBe('baked')
  await vi.advanceTimersByTimeAsync(9000)
  expect(ISLES.meadow.island.source).toBe('baked')
  expect(usePieceStore.getState().sources.meadow).toBe('baked')
})

it('waits to draw the farm for its own piece and the pieces in it, not the ones still to buy', () => {
  expect(piecesToWaitFor([])).toEqual(['main'])
  expect(piecesToWaitFor(['meadow', 'islet'])).toEqual(['main', 'meadow', 'islet'])
})
