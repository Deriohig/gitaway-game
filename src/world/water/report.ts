import { create } from 'zustand'
import type { WaterTierName } from './tier'

// What each piece's water is drawn as, for the world element's `data-water`
// (World.tsx), as `data-pieces` reports the ground: `main:v2:pond,fall` while
// the baked pond and its fall are drawn, `main:legacy` while today's water is
// (while it loads, or if it failed to). With it, the tier the piece's water is drawn at, for
// `data-water-tier`. A subscribable store, as riseState.ts is. UI only, never
// saved.

/** The pieces with baked water (water.json's), in the blueprint's order. */
export type WaterPieceId = 'main' | 'wetland' | 'highland'

/** Every piece with baked water, in the blueprint's order: the one ordered list of them, which the loads and `data-water` follow. */
export const WATER_PIECES: readonly WaterPieceId[] = ['main', 'wetland', 'highland']

/** What one piece reports: its water as drawn, and the tier it is drawn at ('' when it doesn't say). */
interface PieceReport {
  value: string
  tier: WaterTierName | ''
}

type Reports = Partial<Record<WaterPieceId, PieceReport>>

const useReportStore = create<{ pieces: Reports }>(() => ({ pieces: {} }))

/**
 * Sets what a piece's water reports (as `<piece>:v2:<bodies>` or
 * `<piece>:legacy`) and the tier it is drawn at, or, with null, takes both out.
 */
export function setWaterReport(piece: WaterPieceId, value: string | null, tier: WaterTierName | '' = ''): void {
  useReportStore.setState((s) => {
    const was = s.pieces[piece]
    if (value === null ? !was : was?.value === value && was.tier === tier) return s
    const pieces = { ...s.pieces }
    if (value === null) delete pieces[piece]
    else pieces[piece] = { value, tier }
    return { pieces }
  })
}

const format = (pieces: Reports) =>
  WATER_PIECES.filter((id) => pieces[id])
    .map((id) => pieces[id]!.value)
    .join(' ')

/** Every piece's report, in the blueprint's order and space-separated (`main:v2:pond,fall wetland:legacy`): what `data-water` shows. */
export const waterReport = (): string => format(useReportStore.getState().pieces)

/** The same, kept up to date in a component. */
export const useWaterReport = (): string => useReportStore((s) => format(s.pieces))

/** The tier the pieces report their water drawn at (one device, one tier), '' while none says: what `data-water-tier` shows. */
const tierOf = (pieces: Reports): WaterTierName | '' => WATER_PIECES.map((id) => pieces[id]?.tier ?? '').find((t) => t !== '') ?? ''

export const waterTierReport = (): WaterTierName | '' => tierOf(useReportStore.getState().pieces)

/** The same, kept up to date in a component. */
export const useWaterTierReport = (): WaterTierName | '' => useReportStore((s) => tierOf(s.pieces))

const drawnV2 = (report: PieceReport | undefined, piece: WaterPieceId) => report?.value.startsWith(`${piece}:v2:`) ?? false

/** Whether a piece's baked water is drawn now (so its dressing stands on the art's shore). */
export const waterDrawnV2 = (piece: WaterPieceId): boolean => drawnV2(useReportStore.getState().pieces[piece], piece)

/** The same, kept up to date in a component. */
export const useWaterDrawnV2 = (piece: WaterPieceId): boolean => useReportStore((s) => drawnV2(s.pieces[piece], piece))
