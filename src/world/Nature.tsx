import * as THREE from 'three'
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Asset } from './Asset'
import { useFarEverywhere } from './Composed'
import { farModelOf } from './composition'
import { HERO_ROT } from './layout'
import { mat } from './materials'
import { PALETTE } from './palette'
import { rng, spotHash } from './random'
import type { Island } from './terrain'
import { useSway, windMaterial } from './wind'

// Shared low-poly geometries.
export const GEO = {
  blob: new THREE.IcosahedronGeometry(1, 0),
  blobSoft: new THREE.IcosahedronGeometry(1, 1),
  trunk: new THREE.CylinderGeometry(0.09, 0.14, 1, 5),
  cone: new THREE.ConeGeometry(1, 1, 6),
  rock: new THREE.DodecahedronGeometry(1, 0),
  ball: new THREE.SphereGeometry(1, 6, 5),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 8),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
}

type Vec3 = [number, number, number]

const LEAVES = ['leaf', 'leafLight', 'leafDark', 'sage'] as const

/** Points a sway ref at a named node of a loaded model. */
function swayNode(ref: RefObject<THREE.Object3D | null>, name: string) {
  return (root: THREE.Object3D) => {
    ref.current = root.getObjectByName(name) ?? null
  }
}

/**
 * A painterly tree's model: on a phone, held either way up, its far version,
 * as the composition's trees are drawn there (composition.ts,
 * farEverywhere), lighter to draw and to hold. It has the same Canopy and
 * Crown nodes, so it sways the same way.
 */
function useTreeModel(id: string): string {
  return useFarEverywhere() ? (farModelOf(id) ?? id) : id
}

export function RoundTree({ position, scale = 1, seed = 1, fruit }: { position: Vec3; scale?: number; seed?: number; fruit?: string }) {
  const canopy = useRef<THREE.Object3D>(null)
  useSway(canopy, seed * 1.7, 0.03)
  const id = useTreeModel(fruit ? 'tree_fruit' : seed % 2 ? 'tree_round_b' : 'tree_round_a')
  const onLoad = useMemo(() => swayNode(canopy, 'Canopy'), [])
  return (
    <group position={position} scale={scale} rotation-y={(seed * 2.4) % (Math.PI * 2)}>
      <Asset id={id} fallback={<RoundTreeShell seed={seed} fruit={fruit} canopy={canopy} />} onLoad={onLoad} />
    </group>
  )
}

const ORIGIN: Vec3 = [0, 0, 0]

/**
 * The big round tree behind the farmhouse: the hero_tree model, turned with
 * its broad side to the camera and settled `sink` into its slope as the art
 * places it, or a round tree of `scale` until the model is ready.
 */
export function HeroTree({ position, scale, seed, sink = 0 }: { position: Vec3; scale: number; seed: number; sink?: number }) {
  const canopy = useRef<THREE.Object3D>(null)
  useSway(canopy, seed * 1.7, 0.02)
  const onLoad = useMemo(() => swayNode(canopy, 'Canopy'), [])
  const place = useMemo(() => ({ position: [0, sink, 0] as Vec3, rotation: [0, HERO_ROT, 0] as Vec3 }), [sink])
  return (
    <group position={position}>
      <Asset id="hero_tree" place={place} onLoad={onLoad} fallback={<RoundTree position={ORIGIN} scale={scale} seed={seed} />} />
    </group>
  )
}

function RoundTreeShell({ seed, fruit, canopy }: { seed: number; fruit?: string; canopy: RefObject<THREE.Object3D | null> }) {
  const parts = useMemo(() => {
    const r = rng(seed * 97 + 13)
    const tone = (i: number) => LEAVES[(i + Math.floor(r() * 3)) % LEAVES.length]
    const blobs = [
      { p: [0, 1.3, 0] as Vec3, s: 0.72, c: tone(0) },
      { p: [0.34 * (r() - 0.2), 1.05, 0.3 * (r() - 0.3)] as Vec3, s: 0.5, c: tone(1) },
      { p: [-0.2 * r(), 1.78, -0.12] as Vec3, s: 0.46, c: tone(2) },
    ]
    const fruits = fruit
      ? Array.from({ length: 7 }, () => {
          const a = r() * Math.PI * 2
          const y = 1.0 + r() * 0.8
          const rad = 0.62 + r() * 0.1
          return [Math.cos(a) * rad, y, Math.sin(a) * rad] as Vec3
        })
      : []
    return { blobs, fruits }
  }, [seed, fruit])
  return (
    <group>
      <mesh geometry={GEO.trunk} material={mat('woodDark')} position-y={0.5} castShadow />
      <group ref={canopy}>
        {parts.blobs.map((b, i) => (
          <mesh key={i} geometry={GEO.blob} material={mat(b.c)} position={b.p} scale={b.s} castShadow receiveShadow />
        ))}
        {parts.fruits.map((p, i) => (
          <mesh key={`f${i}`} geometry={GEO.ball} material={mat(fruit!)} position={p} scale={0.085} />
        ))}
      </group>
    </group>
  )
}

export function PineTree({ position, scale = 1, seed = 1 }: { position: Vec3; scale?: number; seed?: number }) {
  const crown = useRef<THREE.Object3D>(null)
  useSway(crown, seed * 2.3, 0.025, 0.7)
  const id = useTreeModel(seed % 2 ? 'tree_pine_b' : 'tree_pine_a')
  const onLoad = useMemo(() => swayNode(crown, 'Crown'), [])
  const shell = (
    <group>
      <mesh geometry={GEO.trunk} material={mat('woodDark')} position-y={0.35} scale={[1, 0.7, 1]} castShadow />
      <group ref={crown}>
        <mesh geometry={GEO.cone} material={mat('forest')} position-y={0.95} scale={[0.72, 0.95, 0.72]} castShadow />
        <mesh geometry={GEO.cone} material={mat('leafDark')} position-y={1.5} scale={[0.56, 0.85, 0.56]} castShadow />
        <mesh geometry={GEO.cone} material={mat('forest')} position-y={2.0} scale={[0.38, 0.7, 0.38]} castShadow />
      </group>
    </group>
  )
  return (
    <group position={position} scale={scale} rotation-y={(seed * 2.4) % (Math.PI * 2)}>
      <Asset id={id} fallback={shell} onLoad={onLoad} />
    </group>
  )
}

/**
 * Which of the art's painterly bushes a bush is: bush_flowering where it
 * flowers, otherwise bush_a or the berried bush_berry, by its seed. By the
 * seed's second bit, not its first: the farm's bushes flower every other one,
 * so the ones that don't all have odd seeds (layout.ts, bushLook).
 */
export function bushModel(seed: number, flowers = false): string {
  if (flowers) return 'bush_flowering'
  return (seed >> 1) % 2 ? 'bush_berry' : 'bush_a'
}

/**
 * A bush: the art's painterly bush (bushModel), turned a little differently
 * each time, with the procedural bush standing in until it loads. The models
 * stand about as wide and tall as the stand-in at the same scale.
 */
export function Bush({ position, scale = 1, seed = 1, flowers }: { position: Vec3; scale?: number; seed?: number; flowers?: boolean }) {
  const id = bushModel(seed, flowers)
  const place = useMemo(() => ({ rotation: [0, (seed * 2.4) % (Math.PI * 2), 0] as Vec3 }), [seed])
  return (
    <group position={position} scale={scale}>
      <Asset id={id} place={place} fallback={<BushShell seed={seed} flowers={flowers} />} />
    </group>
  )
}

/** The procedural bush: three leafy blobs, dotted with flowers where it flowers. */
function BushShell({ seed, flowers }: { seed: number; flowers?: boolean }) {
  const r = useMemo(() => rng(seed * 31 + 7), [seed])
  const blobs = useMemo(
    () =>
      Array.from({ length: 3 }, (_, i) => ({
        p: [(r() - 0.5) * 0.5, 0.22 + r() * 0.1, (r() - 0.5) * 0.5] as Vec3,
        s: 0.26 + r() * 0.12,
        c: LEAVES[(i + seed) % LEAVES.length],
      })),
    [r, seed],
  )
  const dots = useMemo(
    () => (flowers ? Array.from({ length: 6 }, () => [(r() - 0.5) * 0.7, 0.35 + r() * 0.2, (r() - 0.5) * 0.7] as Vec3) : []),
    [flowers, r],
  )
  return (
    <group>
      {blobs.map((b, i) => (
        <mesh key={i} geometry={GEO.blob} material={mat(b.c)} position={b.p} scale={b.s} castShadow receiveShadow />
      ))}
      {dots.map((p, i) => (
        <mesh key={`d${i}`} geometry={GEO.ball} material={mat(i % 2 ? 'blossom' : 'cream')} position={p} scale={0.055} />
      ))}
    </group>
  )
}

const ROCK_IDS = ['rock_c', 'rock_a', 'rock_b'] as const
/** The stand-in spans about this many times its scale; the rock models span about 1. */
const ROCK_SPAN = 1.85

/**
 * A stone standing on the ground at `position`. The stand-in is a tilted
 * dodecahedron centred `lift` above it; a rock model (rock_a, rock_b or the
 * flat rock_c, picked by the spot) spans the same width, settled a little in,
 * turned by `turn` (rotation.y), or by a turn picked by the spot.
 */
export function Rock({ position, lift = 0, scale = 1, color = 'stone', turn }: { position: Vec3; lift?: number; scale?: number | Vec3; color?: string; turn?: number }) {
  const [x, , z] = position
  const [sx, sy, sz] = typeof scale === 'number' ? [scale, scale, scale] : scale
  const { id, place } = useMemo(() => {
    const k = spotHash(x, z)
    const s: Vec3 = [sx * ROCK_SPAN, sy * ROCK_SPAN, sz * ROCK_SPAN]
    return {
      id: ROCK_IDS[Math.floor(k * ROCK_IDS.length)],
      place: { position: [0, -0.06 * s[1], 0] as Vec3, rotation: [0, turn ?? spotHash(z, x) * Math.PI * 2, 0] as Vec3, scale: s },
    }
  }, [x, z, sx, sy, sz, turn])
  return (
    <group position={position}>
      <Asset
        id={id}
        place={place}
        fallback={<mesh geometry={GEO.rock} material={mat(color)} position-y={lift} scale={scale} rotation={[0.3, 0.7, 0.1]} castShadow receiveShadow />}
      />
    </group>
  )
}

const FLOWER_COLORS = [PALETTE.terracotta, PALETTE.gold, PALETTE.blossom, PALETTE.cream, '#B9A3C9']

/**
 * A raised bed of wildflowers: the art's painterly bed, sized to the slot and
 * turned a little differently each time (as in the art proof), with the
 * procedural bed standing in until it loads.
 */
export function FlowerBed({ position, seed = 1 }: { position: Vec3; seed?: number }) {
  return (
    <group position={position}>
      <Asset id="flowerbed" fallback={<FlowerBedShell seed={seed} />} place={{ scale: 0.85, rotation: [0, ((seed - 1) * 1.3) % Math.PI, 0] }} />
    </group>
  )
}

/** The procedural bed: a soil mound and a carpet of leaves, its flower heads nodding in the wind. */
function FlowerBedShell({ seed }: { seed: number }) {
  const heads = useRef<THREE.Group>(null)
  useSway(heads, seed, 0.05, 1.3)
  const flowers = useMemo(() => {
    const r = rng(seed * 53)
    return Array.from({ length: 11 }, () => {
      const a = r() * Math.PI * 2
      const d = Math.sqrt(r()) * 0.42
      return { p: [Math.cos(a) * d, 0.2 + r() * 0.12, Math.sin(a) * d * 0.7] as Vec3, c: FLOWER_COLORS[Math.floor(r() * FLOWER_COLORS.length)] }
    })
  }, [seed])
  return (
    <group>
      <mesh geometry={GEO.cyl} material={mat('soilLight')} position-y={0.05} scale={[0.55, 0.12, 0.4]} receiveShadow />
      <mesh geometry={GEO.blob} material={mat('leafLight')} position-y={0.14} scale={[0.46, 0.1, 0.32]} />
      <group ref={heads}>
        {flowers.map((f, i) => (
          <mesh key={i} geometry={GEO.ball} material={mat(f.c)} position={f.p} scale={0.07} />
        ))}
      </group>
    </group>
  )
}

const flowerGeo = new THREE.IcosahedronGeometry(1, 0)
const flowerMat = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true })
const FLOWER_TINTS = [...FLOWER_COLORS, PALETTE.cream, PALETTE.cream].map((c) => new THREE.Color(c))

/** Wildflowers dotted through the grass, all in a single draw call. */
export function Wildflowers({ island, count, avoid, seed = 9 }: { island: Island; count: number; avoid?: (x: number, z: number) => boolean; seed?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const r = rng(seed)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const s = new THREE.Vector3()
    const p = new THREE.Vector3()
    let placed = 0
    // Flowers grow in loose drifts: pick a few centres, then scatter around them.
    const drifts = Array.from({ length: Math.ceil(count / 7) }, () => {
      const a = r() * Math.PI * 2
      const d = (0.35 + r() * 0.55) * island.outline(a)
      return [Math.cos(a) * d, Math.sin(a) * d, Math.floor(r() * FLOWER_TINTS.length)] as const
    })
    for (let tries = 0; placed < count && tries < count * 12; tries++) {
      const [cx, cz, tint] = drifts[tries % drifts.length]
      const x = cx + (r() - 0.5) * 1.4
      const z = cz + (r() - 0.5) * 1.4
      if (Math.hypot(x, z) > island.outline(Math.atan2(z, x)) * 0.92 || avoid?.(x, z)) continue
      p.set(x, island.height(x, z) + 0.06, z)
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, r() * Math.PI)
      s.setScalar(0.045 + r() * 0.025)
      m.compose(p, q, s)
      mesh.setMatrixAt(placed, m)
      mesh.setColorAt(placed, FLOWER_TINTS[r() > 0.25 ? tint : Math.floor(r() * FLOWER_TINTS.length)])
      placed++
    }
    mesh.count = placed
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [island, count, avoid, seed])
  return <instancedMesh ref={ref} args={[flowerGeo, flowerMat, count]} frustumCulled={false} />
}

function tuftGeometry(): THREE.BufferGeometry {
  const blades = [-0.6, 0, 0.6, 1.2].map((tilt, i) => {
    const g = new THREE.ConeGeometry(0.06, 0.17 + (i % 2) * 0.05, 3)
    g.translate(0, 0.08, 0)
    g.rotateZ(tilt * 0.45)
    g.rotateY(i * 1.6)
    return g
  })
  return mergeGeometries(blades)!
}

const tuftGeo = tuftGeometry()
const tuftMat = windMaterial('#ffffff', 1.6)
const TUFT_TINTS = ['#A9BC8C', '#B4C394', '#93A97E', '#C2C994'].map((c) => new THREE.Color(c))

/** Instanced grass tufts scattered over an island, leaning in the wind. */
export function GrassTufts({ island, count, avoid, seed = 5 }: { island: Island; count: number; avoid?: (x: number, z: number) => boolean; seed?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const r = rng(seed)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const s = new THREE.Vector3()
    const p = new THREE.Vector3()
    let placed = 0
    for (let tries = 0; placed < count && tries < count * 20; tries++) {
      const a = r() * Math.PI * 2
      const d = Math.sqrt(r()) * 0.93 * island.outline(a)
      const x = Math.cos(a) * d
      const z = Math.sin(a) * d
      if (avoid?.(x, z)) continue
      p.set(x, island.height(x, z) - 0.02, z)
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, r() * Math.PI)
      const k = 0.7 + r() * 0.7
      s.set(k, k * (0.8 + r() * 0.5), k)
      m.compose(p, q, s)
      mesh.setMatrixAt(placed, m)
      mesh.setColorAt(placed, TUFT_TINTS[Math.floor(r() * TUFT_TINTS.length)])
      placed++
    }
    mesh.count = placed
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [island, count, avoid, seed])
  return <instancedMesh ref={ref} args={[tuftGeo, tuftMat, count]} receiveShadow frustumCulled={false} />
}
