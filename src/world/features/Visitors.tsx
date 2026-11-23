import * as THREE from 'three'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { VisitorId } from '../../game/content/visitors'
import { hash01 } from '../../game/hash'
import type { PresentVisitor } from '../../game/state'
import { hereNow, keepsakeLine, noticeVisitor, ownName, visitorName } from '../../game/systems/visitors'
import { useGame } from '../../store/game'
import { RigAsset } from '../RigAsset'
import { RigBrain, type Species } from '../rigs/brain'
import type { RigController } from '../rigs/RigController'
import { ISLE_VISITORS, type IsleVisitorSpot } from '../isleSpots'
import { ISLES, type IsleId, type XZ } from '../layout'
import { usePieceLoaded } from '../pieceLoader'
import { useMotion, type MotionLevel } from '../motion'
import { GEO } from '../Nature'
import { WorldLabel, type V3 } from '../WorldLabel'
import { VisitorStandIn, type Parts } from './visitorModels'
import { holdStill, restOf as restOfPart, type Rest, type Rests } from './visitorPose'

// Visitors waiting to be noticed (B1), each standing near what drew it in: the
// Brown hare, the one wild visitor left, in the long grass of the meadow isle.
// Hovering shows a soft label and clicking says hello; the almanac's "Here
// now" list does the same from the keyboard.

/** How a visitor passes the time while it waits. */
type Idle = 'flutter' | 'hover' | 'quiver' | 'perch' | 'hop' | 'sit' | 'wade'

/** A spot on one of the neighbouring isles, in its own coordinates. */
type Spot = { kind: 'isle'; isle: IsleId; at: XZ; lift: number }

interface Look {
  spot: Spot
  idle: Idle
  /** Model height, for the label and the click target. */
  height: number
  /** The visitor, its model or its stand-in, is drawn this much larger than the model size, so it reads from afar. */
  scale: number
  /** Which way it faces (π/4 looks at the camera). */
  face: number
}

const isle = (spot: IsleVisitorSpot): Spot => ({ kind: 'isle', ...spot })

const LOOKS: Record<VisitorId, Look> = {
  // On the docked pieces, by what they're named for (see isleSpots.ts).
  hare: { spot: isle(ISLE_VISITORS.hare), idle: 'sit', height: 0.45, scale: 1.3, face: 0.6 },
}

// ---------------------------------------------------------------------------
// Idle motion

const SPEED: Record<MotionLevel, number> = { full: 1, calm: 0.5, still: 0 }

/** Turns a head to look about now and then, easing between glances. */
function glance(o: THREE.Object3D, rest: Rest, t: number, dt: number, amount: number, every: number, phase: number) {
  const n = Math.floor(t / every + phase)
  const want = rest.ry + Math.sin(n * 2.39 + phase) * amount
  o.rotation.y += (want - o.rotation.y) * Math.min(1, dt * 5)
}

/** The visitors drawn from a rig (public/models/rigs.json), and whose behaviour they follow (rigs/brain.ts). */
const RIGGED: Partial<Record<VisitorId, Species>> = { hare: 'hare' }

/**
 * The stand-in's idle motion, and the plain model's. A rigged visitor's clips
 * do all of it (`rigged` is set once the rig is in), so its body is left be:
 * the hare's rig breathes as she sits.
 */
function useIdle(idle: Idle, parts: Parts, body: RefObject<THREE.Group | null>, seed: number, motion: MotionLevel, rigged: RefObject<RigBrain | null>) {
  const rests = useRef<Rests>(new Map())
  const restOf = (o: THREE.Object3D): Rest => restOfPart(rests.current, o)
  const time = useRef(seed * 13)

  useFrame((_, rawDt) => {
    const g = body.current
    const { head, wings, tail } = { head: parts.head.current, wings: parts.wings.current, tail: parts.tail.current }
    const speed = SPEED[motion]
    if (!speed) {
      holdStill(g, [head, wings, tail], rests.current)
      return
    }
    const dt = Math.min(rawDt, 0.1) * speed
    time.current += dt
    const t = time.current

    if (g) {
      g.position.set(0, 0, 0)
      g.scale.y = 1
      if (idle === 'hover') g.position.set(Math.sin(t * 0.9) * 0.05, Math.sin(t * 2.2) * 0.03, Math.cos(t * 0.7) * 0.04)
      if (idle === 'hop') {
        const k = (t + seed) % 6.5
        if (k < 0.35) g.position.y = Math.sin((k / 0.35) * Math.PI) * 0.05
      }
      if (idle === 'sit' && !rigged.current) g.scale.y = 1 + Math.sin(t * 1.7 + seed) * 0.015
    }
    if (wings) {
      const r = restOf(wings)
      if (idle === 'flutter') wings.scale.x = r.sx * (0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.cos(t * 1.3 + seed), 0.6))
      else if (idle === 'hover') wings.scale.x = r.sx * (0.55 + 0.45 * Math.sin(t * 38))
      else if (idle === 'quiver') wings.scale.x = r.sx * (0.9 + 0.1 * Math.sin(t * 24))
    }
    if (head) {
      const r = restOf(head)
      if (idle === 'wade') {
        head.rotation.x = r.rx + Math.sin(t * 0.4 + seed) * 0.12
        glance(head, r, t, dt, 0.35, 5, seed)
      } else if (idle === 'sit') {
        glance(head, r, t, dt, 0.5, 3.4, seed)
      } else {
        glance(head, r, t, dt, 0.75, 2.2, seed)
      }
    }
    if (tail) {
      const r = restOf(tail)
      if (idle === 'sit') tail.rotation.y = r.ry + Math.sin(t * 1.3 + seed) * 0.3
      else tail.rotation.x = r.rx + Math.max(0, Math.sin(t * 0.9 + seed) - 0.85) * 2
    }
  })
}

// ---------------------------------------------------------------------------
// Pointing

/** Shows a pointer while over something clickable, and tidies up after itself. */
export function usePointer() {
  const over = useRef(false)
  useEffect(
    () => () => {
      if (over.current) document.body.style.cursor = ''
    },
    [],
  )
  return {
    enter: () => {
      over.current = true
      document.body.style.cursor = 'pointer'
    },
    leave: () => {
      over.current = false
      document.body.style.cursor = ''
    },
  }
}

// ---------------------------------------------------------------------------
// One visitor

interface Farewell {
  key: number
  at: V3
  text: string
}

type Noticed = (id: VisitorId, at: V3) => void

/** The material of an invisible tap target: drawn, so the pointer finds it, but never seen. */
export const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })

/** A visitor's tap target, an invisible ball round it: how high its middle is over where it waits, and how far it reaches. */
export function visitorTap(id: VisitorId): { height: number; reach: number } {
  const look = LOOKS[id]
  const tall = look.height * look.scale
  return { height: tall * 0.5, reach: Math.max(0.24, tall * 0.62) }
}

function Creature({ id, at, onNoticed }: { id: VisitorId; at: V3; onNoticed: Noticed }) {
  const look = LOOKS[id]
  // What the label calls it: "Brown hare", or Síofra once she has been met.
  const name = useGame((s) => visitorName(s.game, id))
  const run = useGame((s) => s.run)
  const body = useRef<THREE.Group>(null)
  const head = useRef<THREE.Object3D>(null)
  const wings = useRef<THREE.Object3D>(null)
  const tail = useRef<THREE.Object3D>(null)
  const parts = useMemo<Parts>(() => ({ head, wings, tail }), [])
  const seed = useMemo(() => hash01(id) * 10, [id])
  const motion = useMotion()
  const brain = useRef<RigBrain | null>(null)
  const camera = useThree((s) => s.camera)
  useIdle(look.idle, parts, body, seed, motion, brain)
  // Her rig sits, looks about and grooms by itself; with the pointer over her she turns to you, alert.
  useFrame((_, dt) => brain.current?.step(Math.min(dt, 0.1), false, motion))
  const onRig = useCallback(
    (rig: RigController | null) => {
      const species = RIGGED[id]
      brain.current = rig && species ? new RigBrain(rig, species, Math.floor(seed * 1000)) : null
    },
    [id, seed],
  )
  const [hovered, setHovered] = useState(false)
  const pointer = usePointer()

  const onLoad = useCallback((root: THREE.Object3D) => {
    head.current = root.getObjectByName('Head') ?? null
    wings.current = root.getObjectByName('Wings') ?? null
    tail.current = root.getObjectByName('Tail') ?? null
  }, [])

  const tall = look.height * look.scale
  const tap = visitorTap(id)
  const labelAt: V3 = [0, tall + 0.3, 0]
  const notice = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    pointer.leave()
    if (run((s, now) => noticeVisitor(s, id, now))) onNoticed(id, [at[0], at[1] + labelAt[1], at[2]])
  }

  return (
    <group position={at}>
      <group rotation-y={look.face}>
        <group ref={body}>
          <group scale={look.scale}>
            <RigAsset id={`visitor_${id}`} onLoad={onLoad} onRig={onRig} seed={Math.floor(seed * 1000)} fallback={<VisitorStandIn id={id} parts={parts} />} />
          </group>
        </group>
      </group>
      <mesh
        geometry={GEO.ball}
        material={hitMat}
        position-y={tap.height}
        scale={tap.reach}
        onClick={notice}
        onPointerOver={(e) => {
          e.stopPropagation()
          pointer.enter()
          setHovered(true)
          brain.current?.hover(camera.position)
        }}
        onPointerOut={() => {
          pointer.leave()
          setHovered(false)
          brain.current?.hover(null)
        }}
      />
      {hovered && (
        <WorldLabel at={labelAt} motion={motion}>
          {name}
          <span>Click to say hello</span>
        </WorldLabel>
      )}
    </group>
  )
}

// ---------------------------------------------------------------------------
// Where each one stands

function OnIsle({ visit, spot, onNoticed }: { visit: PresentVisitor; spot: Spot; onNoticed: Noticed }) {
  // Its piece's ground is only known once the piece's files are in (or its stand-in is ready).
  const loaded = usePieceLoaded(spot.isle)
  if (!loaded) return null
  const def = ISLES[spot.isle]
  const [px, py, pz] = def.pos
  const [x, z] = spot.at
  return <Creature id={visit.id} at={[px + x, py + def.island.height(x, z) + spot.lift, pz + z]} onNoticed={onNoticed} />
}

function Visitor({ visit, onNoticed }: { visit: PresentVisitor; onNoticed: Noticed }) {
  return <OnIsle visit={visit} spot={LOOKS[visit.id].spot} onNoticed={onNoticed} />
}

let farewellSeq = 0

/** Visitors waiting to be noticed (B1), standing near what drew them in. Click one to notice it. */
export function Visitors() {
  const present = hereNow(useGame((s) => s.game.visitors.present))
  const motion = useMotion()
  const [farewells, setFarewells] = useState<Farewell[]>([])
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const onNoticed = useCallback<Noticed>((id, at) => {
    const key = ++farewellSeq
    // Said as the farm is now, once the hello is in: by her name if she has one.
    const text = keepsakeLine(id, ownName(useGame.getState().game, id))
    setFarewells((list) => [...list, { key, at, text }])
    timers.current.push(setTimeout(() => setFarewells((list) => list.filter((f) => f.key !== key)), 3600))
  }, [])

  return (
    <group>
      {present.map((v) => (
        <Visitor key={v.id} visit={v} onNoticed={onNoticed} />
      ))}
      {farewells.map((f) => (
        <WorldLabel key={f.key} at={f.at} farewell motion={motion}>
          {f.text}
        </WorldLabel>
      ))}
    </group>
  )
}
