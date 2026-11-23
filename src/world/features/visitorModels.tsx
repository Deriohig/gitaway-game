import * as THREE from 'three'
import type { JSX, RefObject } from 'react'
import type { VisitorId } from '../../game/content/visitors'
import { mat } from '../materials'
import { GEO } from '../Nature'

// Procedural stand-ins for the wild visitors (art/ASSETS.md, Phase 2 group 2):
// small low-poly creatures built from the shared shapes, facing +Z with their
// feet on y = 0, at the model sizes the asset brief gives. A hand-made model
// replaces each one through <Asset id="visitor_<id>">. The parts that move
// (Head, Wings, Tail) are groups the idle motion drives, just as it drives the
// named nodes of a model.

type V3 = [number, number, number]
type Geo = keyof typeof GEO

export interface Parts {
  head: RefObject<THREE.Object3D | null>
  wings: RefObject<THREE.Object3D | null>
  tail: RefObject<THREE.Object3D | null>
}

/** One painted piece. */
function P({ g = 'blobSoft', c, p, s = 1, r }: { g?: Geo; c: string; p?: V3; s?: number | V3; r?: V3 }) {
  return <mesh geometry={GEO[g]} material={mat(c)} position={p} scale={s} rotation={r} castShadow />
}

/** A pair of mirrored pieces, left and right of the centre line. */
function Pair({ g, c, p, s, r }: { g?: Geo; c: string; p: V3; s?: number | V3; r?: V3 }) {
  const flip = (v: V3 | undefined): V3 | undefined => (v ? [v[0], -v[1], -v[2]] : undefined)
  return (
    <>
      <P g={g} c={c} p={p} s={s} r={r} />
      <P g={g} c={c} p={[-p[0], p[1], p[2]]} s={s} r={flip(r)} />
    </>
  )
}

const Eyes = ({ x, y, z, s = 0.008, c = 'ink' }: { x: number; y: number; z: number; s?: number; c?: string }) => <Pair g="ball" c={c} p={[x, y, z]} s={s} />

const C = {
  ink: '#403D35',
  cream: '#FFF8EC',
  hare: '#B98A63',
}

const MODELS: Record<VisitorId, (p: Parts) => JSX.Element> = {
  hare: ({ head }) => (
    <group>
      <P c={C.hare} p={[0, 0.1, -0.04]} s={[0.085, 0.1, 0.12]} />
      <P c={C.hare} p={[0, 0.2, 0.04]} s={[0.065, 0.1, 0.065]} />
      <P c={C.cream} p={[0, 0.17, 0.08]} s={[0.045, 0.07, 0.03]} />
      <Pair g="box" c={C.hare} p={[0.03, 0.06, 0.085]} s={[0.02, 0.12, 0.02]} />
      <P g="ball" c={C.cream} p={[0, 0.08, -0.155]} s={0.03} />
      <group ref={head} position={[0, 0.3, 0.06]}>
        <P c={C.hare} s={[0.05, 0.05, 0.065]} />
        <Pair c={C.hare} p={[0.025, 0.11, -0.01]} s={[0.018, 0.09, 0.012]} r={[-0.15, 0, -0.12]} />
        <Pair g="ball" c={C.ink} p={[0.036, 0.19, -0.022]} s={0.013} />
        <Eyes x={0.034} y={0.012} z={0.03} />
        <P g="ball" c={C.ink} p={[0, -0.005, 0.064]} s={0.008} />
      </group>
    </group>
  ),
}

/** The procedural stand-in for a visitor, with its moving parts on the given refs. */
export function VisitorStandIn({ id, parts }: { id: VisitorId; parts: Parts }) {
  return MODELS[id](parts)
}
