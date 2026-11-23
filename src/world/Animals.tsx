import * as THREE from 'three'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useCallback, useMemo, useRef, type ReactNode } from 'react'
import { chickenCoat, goatCoat } from './coats'
import { duckAt } from './ducks'
import { CAT_NAP, CHICKEN_YARDS, DOG_YARD, MAIN, POND, POND_LEVEL, catHead, type XZ } from './layout'
import { mat } from './materials'
import { useMotion, useWandering } from './motion'
import { GEO } from './Nature'
import { PALETTE } from './palette'
import { rng } from './random'
import { RigAsset } from './RigAsset'
import { RigBrain, type Species } from './rigs/brain'
import type { RigController } from './rigs/RigController'
import type { Island } from './terrain'
import { farmPatch, hopWalker, pausableTime, startWalker, stepWalker, type PausableClock, type Patch } from './wander'

// Animals amble about on their own, pause, peck or graze, and hop if you
// click them. Nobody needs feeding. Each is drawn from its rig where it has
// one (RigAsset): its clips walk, breathe and graze it, and rigs/brain.ts picks
// them from what the walker does. The procedural motion here (the bob, the
// nod, the cat's breathing) is for the plain model or the stand-in only.

/** An animal's patch (see wander.ts), and how it ambles about it. */
interface WanderOpts extends Patch {
  island: Island
  speed: number
  seed: number
  idle: [number, number]
}

/** The brain of an animal's rig, made once the rig is in (for RigAsset's onRig), and gone with it. */
function useRigBrain(species: Species, seed: number, onRig?: (rig: RigController) => void) {
  const brain = useRef<RigBrain | null>(null)
  const camera = useThree((s) => s.camera)
  const take = useCallback(
    (rig: RigController | null) => {
      brain.current = rig ? new RigBrain(rig, species, seed) : null
      if (rig) onRig?.(rig)
    },
    [species, seed, onRig],
  )
  // The player is the camera: with the pointer over it, it looks your way.
  const hover = useCallback((on: boolean) => brain.current?.hover(on ? camera.position : null), [camera])
  return { brain, camera, onRig: take, hover }
}

function useWanderer(opts: WanderOpts, species: Species) {
  const body = useRef<THREE.Group>(null)
  const head = useRef<THREE.Object3D>(null)
  // Quiet mode stands the animals still where they are (motion.ts); a click still makes one hop.
  const wandering = useWandering()
  const motion = useMotion()
  const { brain, camera, onRig, hover } = useRigBrain(species, opts.seed)
  // The amble itself is worked out in wander.ts (stepWalker), where it's tested.
  const { walker, amble } = useMemo(() => {
    const rand = rng(opts.seed)
    return { walker: startWalker(opts, rand), amble: { ...opts, rand, wandering: true } }
  }, [opts])

  useFrame((_, rawDt) => {
    const g = body.current
    if (!g) return
    const dt = Math.min(rawDt, 0.1)
    amble.wandering = wandering
    const { lift, walking, headDown } = stepWalker(walker, dt, amble)
    const [x, z] = walker.pos
    g.rotation.y = walker.heading
    const rigged = brain.current
    if (rigged) {
      // The rig's own walk bobs it, and its stands graze or peck (a lie-down stands it longer).
      walker.wait += rigged.step(dt, walking, motion, opts.speed)
      g.position.set(x, opts.island.height(x, z) + lift, z)
      return
    }
    const bob = walking ? Math.abs(Math.sin(performance.now() / 110)) * 0.02 : 0
    g.position.set(x, opts.island.height(x, z) + lift + bob, z)
    if (head.current) {
      // peck or graze now and then while standing still
      const down = headDown ? 1 : 0
      head.current.rotation.x += (down * 0.7 - head.current.rotation.x) * Math.min(1, dt * 8)
    }
  })

  const hop = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    // A rig plays its tap (a goat's or a sheep's own Hop, the dog's Happy); the hen flaps up as well.
    if (!brain.current || brain.current.tap(camera.position)) hopWalker(walker)
  }
  const onLoad = useCallback((root: THREE.Object3D) => {
    head.current = root.getObjectByName('Head') ?? null
  }, [])
  return { body, head, hop, onLoad, onRig, hover }
}

// The stand-in animals are drawn a little larger than life so they read from afar.
const STAND_IN_SCALE = 1.45

function Clickable({ onClick, onHover, children }: { onClick: (e: ThreeEvent<MouseEvent>) => void; onHover?: (on: boolean) => void; children: ReactNode }) {
  return (
    <group
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
        onHover?.(true)
      }}
      onPointerOut={() => {
        document.body.style.cursor = ''
        onHover?.(false)
      }}
    >
      {children}
    </group>
  )
}

export function Chicken({ seed, island = MAIN, center, radius }: { seed: number; island?: Island; center: XZ; radius: number }) {
  const opts = useMemo(() => ({ ...farmPatch(center, radius), island, speed: 0.32, seed, idle: [1.5, 5] as [number, number] }), [island, center, radius, seed])
  const { body, head, hop, onLoad, onRig, hover } = useWanderer(opts, 'chicken')
  const coat = chickenCoat(seed)
  const tint = coat.standIn
  const standIn = (
    <group scale={STAND_IN_SCALE}>
      <mesh geometry={GEO.blobSoft} material={mat(tint)} position-y={0.16} scale={[0.12, 0.11, 0.15]} castShadow />
      <mesh geometry={GEO.cone} material={mat(tint)} position={[0, 0.24, -0.13]} rotation-x={-0.6} scale={[0.06, 0.1, 0.05]} />
      <group ref={head} position={[0, 0.25, 0.1]}>
        <mesh geometry={GEO.blobSoft} material={mat(tint)} position={[0, 0.03, 0.04]} scale={0.065} />
        <mesh geometry={GEO.box} material={mat('chickenComb')} position={[0, 0.1, 0.04]} scale={[0.02, 0.045, 0.06]} />
        <mesh geometry={GEO.cone} material={mat('beak')} position={[0, 0.03, 0.11]} rotation-x={Math.PI / 2} scale={[0.02, 0.05, 0.02]} />
      </group>
      {[-0.04, 0.04].map((x) => (
        <mesh key={x} geometry={GEO.box} material={mat('beak')} position={[x, 0.04, 0]} scale={[0.015, 0.08, 0.015]} />
      ))}
    </group>
  )
  return (
    <group ref={body}>
      <Clickable onClick={hop} onHover={hover}>
        <RigAsset id="chicken" fallback={standIn} onLoad={onLoad} tint={coat.tint} onRig={onRig} seed={seed} />
      </Clickable>
    </group>
  )
}

export function Sheep({ seed, island, center, radius }: { seed: number; island: Island; center: XZ; radius: number }) {
  const opts = useMemo(() => ({ island, center, radius, speed: 0.18, seed, idle: [3, 9] as [number, number] }), [island, center, radius, seed])
  const { body, head, hop, onLoad, onRig, hover } = useWanderer(opts, 'sheep')
  const wool = useMemo(() => {
    const r = rng(seed + 5)
    return Array.from({ length: 6 }, (_, i) => ({ p: [(r() - 0.5) * 0.18, 0.34 + r() * 0.08, -0.15 + i * 0.06] as [number, number, number], s: 0.14 + r() * 0.04 }))
  }, [seed])
  const standIn = (
    <group scale={STAND_IN_SCALE}>
      {wool.map((w, i) => (
        <mesh key={i} geometry={GEO.blobSoft} material={mat('wool')} position={w.p} scale={w.s} castShadow />
      ))}
      <group ref={head} position={[0, 0.38, 0.2]}>
        <mesh geometry={GEO.blobSoft} material={mat('sheepFace')} position={[0, 0, 0.06]} scale={[0.07, 0.08, 0.1]} />
        <mesh geometry={GEO.blobSoft} material={mat('wool')} position={[0, 0.07, 0.03]} scale={0.06} />
        {[-0.07, 0.07].map((x) => (
          <mesh key={x} geometry={GEO.blob} material={mat('sheepFace')} position={[x, 0.02, 0.02]} scale={[0.05, 0.02, 0.03]} />
        ))}
      </group>
      {[[-0.08, -0.12], [0.08, -0.12], [-0.08, 0.12], [0.08, 0.12]].map(([x, z], i) => (
        <mesh key={i} geometry={GEO.box} material={mat('sheepFace')} position={[x, 0.11, z]} scale={[0.04, 0.22, 0.04]} />
      ))}
    </group>
  )
  return (
    <group ref={body}>
      <Clickable onClick={hop} onHover={hover}>
        {/* The rig is the painted Meshy sheep (GAME-NOTE), slimmer than the plain sheep.glb it replaces. */}
        <RigAsset id="sheep" fallback={standIn} onLoad={onLoad} onRig={onRig} seed={seed} />
      </Clickable>
    </group>
  )
}

const GOAT_HORN = '#CDBFA6'

/**
 * A goat, about the sheep's size but leaner and longer in the leg, with swept-back horns, a beard and a
 * short tail that flicks up. It picks its way about its patch of the highland, and grazes with its head down.
 */
export function Goat({ seed, island, center, radius, clear }: { seed: number; island: Island; center: XZ; radius: number; clear?: (x: number, z: number) => boolean }) {
  const opts = useMemo(
    () => ({ island, center, radius, speed: 0.22, seed, idle: [2, 6] as [number, number], clear, clearPath: !!clear }),
    [island, center, radius, seed, clear],
  )
  const { body, head, hop, onLoad, onRig, hover } = useWanderer(opts, 'goat')
  const { coat, dark, tint } = goatCoat(seed)
  const standIn = (
    <group scale={STAND_IN_SCALE}>
      {/* Body: a lean barrel on long legs, with a little rump and a chest. */}
      <mesh geometry={GEO.blobSoft} material={mat(coat)} position-y={0.29} scale={[0.1, 0.1, 0.19]} castShadow />
      <mesh geometry={GEO.blobSoft} material={mat(coat)} position={[0, 0.31, 0.1]} scale={[0.09, 0.1, 0.09]} />
      <mesh geometry={GEO.cone} material={mat(coat)} position={[0, 0.39, -0.17]} rotation-x={-0.5} scale={[0.025, 0.07, 0.02]} />
      {/* Neck and head, which drops to graze. */}
      <group ref={head} position={[0, 0.38, 0.17]}>
        <mesh geometry={GEO.blobSoft} material={mat(coat)} position={[0, 0.04, 0.02]} rotation-x={0.5} scale={[0.045, 0.08, 0.045]} />
        <mesh geometry={GEO.blobSoft} material={mat(coat)} position={[0, 0.11, 0.07]} scale={[0.05, 0.055, 0.075]} />
        <mesh geometry={GEO.blobSoft} material={mat(dark)} position={[0, 0.09, 0.13]} scale={[0.032, 0.035, 0.04]} />
        <mesh geometry={GEO.cone} material={mat(dark)} position={[0, 0.04, 0.12]} rotation-x={Math.PI} scale={[0.016, 0.06, 0.016]} />
        {[-1, 1].map((side) => (
          <group key={side}>
            {/* Horns sweep up and back; ears stick out to the side. */}
            <mesh geometry={GEO.cone} material={mat(GOAT_HORN)} position={[side * 0.025, 0.17, 0.05]} rotation={[-0.75, 0, side * -0.18]} scale={[0.014, 0.09, 0.014]} />
            <mesh geometry={GEO.blob} material={mat(dark)} position={[side * 0.06, 0.13, 0.04]} rotation-z={side * 0.5} scale={[0.04, 0.012, 0.022]} />
          </group>
        ))}
      </group>
      {[[-0.055, -0.12], [0.055, -0.12], [-0.055, 0.12], [0.055, 0.12]].map(([x, z], i) => (
        <mesh key={i} geometry={GEO.box} material={mat(dark)} position={[x, 0.12, z]} scale={[0.03, 0.24, 0.03]} />
      ))}
    </group>
  )
  return (
    <group ref={body}>
      <Clickable onClick={hop} onHover={hover}>
        <RigAsset id="goat" fallback={standIn} onLoad={onLoad} tint={tint} onRig={onRig} seed={seed} />
      </Clickable>
    </group>
  )
}

export function Dog({ seed = 9 }: { seed?: number }) {
  const opts = useMemo(() => ({ ...farmPatch(DOG_YARD.center, DOG_YARD.radius), island: MAIN, speed: 0.5, seed, idle: [2, 7] as [number, number] }), [seed])
  const { body, head, hop, onLoad: onHead, onRig, hover } = useWanderer(opts, 'dog')
  const tail = useRef<THREE.Object3D>(null)
  // The plain model's and the stand-in's tail; the rig wags its own (wider for a while after a tap).
  useFrame(({ clock }) => {
    if (tail.current) tail.current.rotation.y = Math.sin(clock.elapsedTime * 9) * 0.5
  })
  const onLoad = useCallback(
    (root: THREE.Object3D) => {
      onHead(root)
      tail.current = root.getObjectByName('Tail') ?? null
    },
    [onHead],
  )
  const standIn = (
    <group scale={STAND_IN_SCALE}>
      <mesh geometry={GEO.blobSoft} material={mat('dog')} position-y={0.24} scale={[0.11, 0.1, 0.2]} castShadow />
      <group ref={head} position={[0, 0.34, 0.18]}>
        <mesh geometry={GEO.blobSoft} material={mat('dog')} position={[0, 0.02, 0.04]} scale={[0.08, 0.08, 0.09]} />
        <mesh geometry={GEO.blobSoft} material={mat('cream')} position={[0, -0.01, 0.12]} scale={[0.045, 0.04, 0.05]} />
        <mesh geometry={GEO.ball} material={mat('ink')} position={[0, 0.01, 0.17]} scale={0.015} />
        {[-0.06, 0.06].map((x) => (
          <mesh key={x} geometry={GEO.blob} material={mat('woodDark')} position={[x, 0.05, 0.0]} rotation-z={x * 6} scale={[0.02, 0.06, 0.04]} />
        ))}
      </group>
      <mesh ref={tail} geometry={GEO.cone} material={mat('dog')} position={[0, 0.32, -0.2]} rotation-x={-0.9} scale={[0.025, 0.12, 0.025]} />
      {[[-0.06, -0.12], [0.06, -0.12], [-0.06, 0.12], [0.06, 0.12]].map(([x, z], i) => (
        <mesh key={i} geometry={GEO.box} material={mat('dog')} position={[x, 0.08, z]} scale={[0.04, 0.17, 0.04]} />
      ))}
    </group>
  )
  return (
    <group ref={body}>
      <Clickable onClick={hop} onHover={hover}>
        <RigAsset id="dog" fallback={standIn} onLoad={onLoad} onRig={onRig} seed={seed} />
      </Clickable>
    </group>
  )
}

/** The cat naps on the porch, breathing slowly. Click and it looks up. */
export function Cat() {
  const group = useRef<THREE.Group>(null)
  const head = useRef<THREE.Object3D>(null)
  const awake = useRef(0)
  const motion = useMotion()
  // The rig's Sleep breathes and its Peek is the tap: the group's breathing and the head tilt below are the plain model's.
  const unbreathe = useCallback(() => group.current?.scale.set(1, 1, 1), [])
  const { brain, camera, onRig, hover } = useRigBrain('cat_sleeping', 1, unbreathe)
  useFrame(({ clock }, rawDt) => {
    if (brain.current) {
      brain.current.step(Math.min(rawDt, 0.1), false, motion)
      return
    }
    const dt = rawDt
    if (group.current) group.current.scale.y = 1 + Math.sin(clock.elapsedTime * 1.3) * 0.04
    awake.current = Math.max(0, awake.current - dt)
    const h = head.current
    if (h) {
      const { tilt } = catHead(awake.current > 0)
      h.rotation.z += (tilt - h.rotation.z) * Math.min(1, dt * 5)
    }
  })
  const onLoad = useCallback((root: THREE.Object3D) => {
    head.current = root.getObjectByName('Head') ?? null
  }, [])
  const standIn = (
    <group scale={STAND_IN_SCALE}>
      <mesh geometry={GEO.blobSoft} material={mat('cat')} position-y={0.08} scale={[0.17, 0.09, 0.13]} castShadow />
      <group ref={head} position={[0.13, 0.08, 0.05]}>
        <mesh geometry={GEO.blobSoft} material={mat('cat')} scale={[0.075, 0.065, 0.075]} />
        {[-0.035, 0.035].map((z) => (
          <mesh key={z} geometry={GEO.cone} material={mat('cat')} position={[0, 0.07, z]} scale={[0.025, 0.05, 0.025]} />
        ))}
      </group>
      <mesh geometry={GEO.blobSoft} material={mat('#C88A55')} position={[-0.05, 0.05, 0.12]} rotation-y={0.4} scale={[0.15, 0.03, 0.035]} />
    </group>
  )
  return (
    <group position={[CAT_NAP.at[0], CAT_NAP.y, CAT_NAP.at[1]]} rotation-y={CAT_NAP.face}>
      <group ref={group}>
        <Clickable
          onClick={(e) => {
            e.stopPropagation()
            if (brain.current) brain.current.tap(camera.position)
            else awake.current = 2.5
          }}
          onHover={hover}
        >
          <RigAsset id="cat_sleeping" fallback={standIn} onLoad={onLoad} onRig={onRig} />
        </Clickable>
      </group>
    </group>
  )
}

/** How many chickens the first yard (layout.ts CHICKEN_YARDS) holds before the rest go to the second. */
const FIRST_YARD = 4

export function Chickens({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const yard = CHICKEN_YARDS[i < FIRST_YARD ? 0 : 1]
        return <Chicken key={i} seed={i + 1} center={yard.center} radius={yard.radius} />
      })}
    </>
  )
}

/** Sheep graze the meadow's pasture (its flat zone, in the meadow's own coordinates), keeping off its edge. */
export function Flock({ count, island, pasture }: { count: number; island: Island; pasture: { at: XZ; r: number } }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Sheep key={i} seed={i + 1} island={island} center={pasture.at} radius={pasture.r * 0.8} />
      ))}
    </>
  )
}

/**
 * Goats graze a patch of the highland (in its own coordinates), keeping to the ground `clear` allows the
 * whole way, so none walks up a riser or over the edge.
 */
export function Herd({ count, island, pasture, clear }: { count: number; island: Island; pasture: { at: XZ; r: number }; clear?: (x: number, z: number) => boolean }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Goat key={i} seed={i + 1} island={island} center={pasture.at} radius={pasture.r} clear={clear} />
      ))}
    </>
  )
}

export function Ducks({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Duck key={i} seed={i + 1} />
      ))}
    </>
  )
}

export function Duck({ seed }: { seed: number }) {
  const group = useRef<THREE.Group>(null)
  const y = MAIN.height(POND.x, POND.z) + 0.08
  // Quiet mode stops the paddling where it is (motion.ts), and it goes on from there afterwards.
  const wandering = useWandering()
  const motion = useMotion()
  const paddle = useRef<PausableClock>({ held: 0, stoppedAt: null })
  const { brain, onRig } = useRigBrain('duck', seed)
  useFrame(({ clock }, dt) => {
    const g = group.current
    if (!g) return
    const at = duckAt(seed, pausableTime(paddle.current, clock.elapsedTime, wandering))
    if (brain.current) {
      // The rig floats: its y 0 is the waterline, its hull just under it, and its Idle bobs it (ruling R32).
      brain.current.step(Math.min(dt, 0.1), wandering, motion)
      g.position.set(at.x, POND_LEVEL, at.z)
    } else g.position.set(at.x, y + at.bob, at.z)
    g.rotation.y = at.heading
  })
  return (
    <group ref={group}>
      <RigAsset
        id="duck"
        seed={seed}
        onRig={onRig}
        fallback={
          <group scale={STAND_IN_SCALE}>
            <mesh geometry={GEO.blobSoft} material={mat('duck')} position-y={0.05} scale={[0.07, 0.06, 0.12]} castShadow />
            <mesh geometry={GEO.blobSoft} material={mat('duckHead')} position={[0, 0.14, 0.08]} scale={0.045} />
            <mesh geometry={GEO.cone} material={mat('beak')} position={[0, 0.13, 0.14]} rotation-x={Math.PI / 2} scale={[0.02, 0.05, 0.015]} />
            <mesh geometry={GEO.cone} material={mat(PALETTE.duck)} position={[0, 0.08, -0.12]} rotation-x={-1.1} scale={[0.03, 0.06, 0.02]} />
          </group>
        }
      />
    </group>
  )
}
