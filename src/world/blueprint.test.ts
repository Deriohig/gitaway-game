import { describe, expect, it } from 'vitest'
import raw from '../../art/config/blueprint.pieces.json?raw'
import { ALL_OFF, withFeatures } from '../game/testing'
import { DOCK_IDS, dockedAt, mainThetaRange, PIECES, piecesInPlay, thetaIn, type DockId, type PieceId } from './blueprint'
import { ISLES } from './layout'

// The island blueprint is copied from the art session's JSON by `npm run blueprint`; the first test fails until it is run again.

interface JsonPiece {
  dockedPosition: number[]
  depth: number
  outline: number[][]
  mainThetaRange?: { deg: number[]; rad: number[] }
  flatZones: { id?: string; kind?: string; at?: number[]; r: number; level: number }[]
  openCoastAnchors?: { id: string; local: number[]; outward?: number[]; y?: number; shedPatch?: { at: number[]; r: number } }[]
}
const json = JSON.parse(raw) as { order: PieceId[]; pieces: Record<PieceId, JsonPiece> }
const TAU = Math.PI * 2

describe('the island blueprint', () => {
  it('holds every piece of the JSON as it is now (run `npm run blueprint` if not), docked at its position and stretch of the rim', () => {
    expect(Object.keys(PIECES)).toEqual(json.order)
    for (const id of json.order) {
      const piece = json.pieces[id]
      expect(PIECES[id].dockedPosition, id).toEqual(piece.dockedPosition)
      expect(PIECES[id].depth, id).toBe(piece.depth)
      expect(PIECES[id].outline, id).toEqual(piece.outline)
      expect(PIECES[id].mainTheta, id).toEqual(piece.mainThetaRange?.deg ?? null)
      if (id !== 'main') expect(PIECES[id].flatZones.map((z) => [z.id, z.kind, z.at, z.r, z.level]), id).toEqual(piece.flatZones.map((z) => [z.id, z.kind, z.at, z.r, z.level]))
      expect(PIECES[id].anchors.map((a) => [a.id, a.at, a.outward, a.y, a.shedPatch]), id).toEqual(
        (piece.openCoastAnchors ?? []).map((a) => [a.id, a.local, a.outward, a.y, a.shedPatch && { at: a.shedPatch.at, r: a.shedPatch.r }]),
      )
    }
    expect(DOCK_IDS).toEqual(json.order.filter((id) => id !== 'main'))
    expect(PIECES.main.dockedPosition).toEqual([0, 0, 0])
    for (const id of DOCK_IDS) {
      expect(ISLES[id].pos, id).toEqual(json.pieces[id].dockedPosition)
      const [from, to] = mainThetaRange(id)
      const [a, b] = json.pieces[id].mainThetaRange!.rad
      expect(from, id).toBeCloseTo(a, 3)
      expect(to, id).toBeCloseTo(b, 3)
    }
  })

  it('has the pieces share out the farm’s whole rim, each stretch starting where the last ends', () => {
    let total = 0
    for (let i = 0; i < DOCK_IDS.length; i++) {
      const [from, to] = mainThetaRange(DOCK_IDS[i])
      const [next] = mainThetaRange(DOCK_IDS[(i + 1) % DOCK_IDS.length])
      expect(Math.abs(Math.sin((next - to) / 2)), DOCK_IDS[i]).toBeLessThan(1e-9)
      total += (((to - from) % TAU) + TAU) % TAU
    }
    expect(total).toBeCloseTo(TAU)
  })

  it('knows which docked piece is alongside each part of the rim, the islet’s across θ = 0 too', () => {
    const mid = (id: DockId) => {
      const [from, to] = mainThetaRange(id)
      return from + ((((to - from) % TAU) + TAU) % TAU) / 2
    }
    for (const id of DOCK_IDS) expect(dockedAt(mid(id), DOCK_IDS)).toBe(id)
    expect(dockedAt(0, ['islet'])).toBe('islet')
    expect(dockedAt(-0.2, ['islet'])).toBe('islet')
    expect(dockedAt(0.2, ['islet'])).toBeNull()
    expect(dockedAt(Math.PI / 4, ['grove', 'islet'])).toBeNull()
    expect(dockedAt(Math.PI / 4 + TAU, ['meadow'])).toBe('meadow')
    expect(thetaIn(Math.PI, [3, -3])).toBe(true)
    expect(thetaIn(0, [3, -3])).toBe(false)
  })

  it.each([
    ['everything off', ALL_OFF, ['main', 'meadow', 'grove', 'islet']],
    ['wild isles', { ...ALL_OFF, wildIsles: true }, ['main', 'meadow', 'wetland', 'highland', 'grove', 'islet']],
    ['biomes, which dress the wild isles and bring no piece', { ...ALL_OFF, biomes: true }, ['main', 'meadow', 'grove', 'islet']],
    ['cottage and git events', { ...ALL_OFF, cottage: true, gitEvents: true }, ['main', 'meadow', 'cottage', 'orchard', 'grove', 'islet']],
    ['ring isles (the glade and the orchard as plain land)', { ...ALL_OFF, ringIsles: true }, ['main', 'meadow', 'cottage', 'orchard', 'grove', 'islet']],
    ['the cottage alone', { ...ALL_OFF, cottage: true }, ['main', 'meadow', 'cottage', 'grove', 'islet']],
    ['git events alone', { ...ALL_OFF, gitEvents: true }, ['main', 'meadow', 'orchard', 'grove', 'islet']],
  ])('loads only the pieces whose feature is on: %s', (_, features, pieces) => {
    expect(withFeatures(features, piecesInPlay)).toEqual(pieces)
  })

  it('has every piece in play as committed, so the island can close all the way round', () => {
    expect(piecesInPlay()).toEqual(json.order)
  })
})
