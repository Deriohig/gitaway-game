import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useCallback, useMemo, useRef, useState, type RefObject } from 'react'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Asset } from './Asset'
import { beeAt, beeGeometry } from './bees'
import { MAIN, SCARECROW_SCALE, SCARECROW_TURN, WELL_ROT, WINDMILL_ROT, type XZ } from './layout'
import { glassMat, glowMat, mat, vertexMat } from './materials'
import { GEO } from './Nature'
import { rng } from './random'
import { sky } from './skyRef'

type V3 = [number, number, number]

function gable(width: number, depth: number, height: number): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(-depth / 2, 0)
  shape.lineTo(depth / 2, 0)
  shape.lineTo(0, height)
  shape.closePath()
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false })
  g.translate(0, 0, -width / 2)
  g.rotateY(Math.PI / 2)
  return g
}

const towerGeo = new THREE.CylinderGeometry(0.46, 0.72, 2.7, 7)
const capGeo = new THREE.ConeGeometry(0.66, 0.8, 7)
const wellRoof = gable(1.0, 0.95, 0.42)
const hiveRoof = gable(0.5, 0.5, 0.18)
const greenhouseRoof = gable(2.0, 1.44, 0.62)
const shelterRoof = gable(1.5, 1.2, 0.5)

export function Windmill({ position }: { position: V3 }) {
  const blades = useRef<THREE.Object3D>(null)
  useFrame((_, dt) => {
    if (blades.current) blades.current.rotation.z -= Math.min(dt, 0.1) * 0.35
  })
  const onLoad = useCallback((root: THREE.Object3D) => {
    blades.current = root.getObjectByName('Blades') ?? null
  }, [])
  return (
    <group position={position} rotation-y={WINDMILL_ROT}>
      <Asset id="windmill" fallback={<WindmillShell blades={blades} />} onLoad={onLoad} />
    </group>
  )
}

function WindmillShell({ blades }: { blades: RefObject<THREE.Object3D | null> }) {
  return (
    <group>
      <mesh geometry={GEO.cyl} material={mat('stoneDark')} position-y={0.08} scale={[0.85, 0.16, 0.85]} receiveShadow />
      <mesh geometry={towerGeo} material={mat('wall')} position-y={1.45} castShadow receiveShadow />
      <mesh geometry={capGeo} material={mat('roof')} position-y={3.18} castShadow />
      <mesh geometry={GEO.box} material={mat('woodDark')} position={[0, 0.45, 0.66]} rotation-x={-0.08} scale={[0.36, 0.6, 0.05]} />
      <mesh geometry={GEO.box} material={glowMat} position={[0, 1.75, 0.55]} rotation-x={-0.08} scale={[0.22, 0.26, 0.04]} />
      <group position={[0, 2.85, 0.62]}>
        <mesh geometry={GEO.cyl6} material={mat('woodDark')} rotation-x={Math.PI / 2} scale={[0.1, 0.3, 0.1]} />
        <group ref={blades} position-z={0.12}>
          {[0, 1, 2, 3].map((i) => (
            <group key={i} rotation-z={(i * Math.PI) / 2}>
              <mesh geometry={GEO.box} material={mat('woodDark')} position-y={0.85} scale={[0.06, 1.7, 0.04]} castShadow />
              <mesh geometry={GEO.box} material={mat('cream')} position={[0.14, 1.0, 0]} scale={[0.24, 1.25, 0.02]} castShadow />
            </group>
          ))}
        </group>
      </group>
    </group>
  )
}

export function Greenhouse({ position, rotation }: { position: V3; rotation: number }) {
  return (
    <group position={position} rotation-y={rotation}>
      <Asset id="greenhouse" fallback={<GreenhouseShell />} />
    </group>
  )
}

function GreenhouseShell() {
  const frame = mat('white')
  return (
    <group>
      <mesh geometry={GEO.box} material={mat('woodLight')} position-y={0.12} scale={[2.05, 0.24, 1.48]} castShadow receiveShadow />
      <mesh geometry={GEO.box} material={glassMat} position-y={0.66} scale={[2.0, 0.84, 1.44]} />
      <mesh geometry={greenhouseRoof} material={glassMat} position-y={1.08} />
      {[-1, -0.33, 0.33, 1].map((x) =>
        [-0.72, 0.72].map((z) => (
          <mesh key={`${x}${z}`} geometry={GEO.box} material={frame} position={[x, 0.66, z]} scale={[0.04, 0.86, 0.04]} />
        )),
      )}
      <mesh geometry={GEO.box} material={frame} position={[0, 1.7, 0]} scale={[2.04, 0.05, 0.05]} />
      {[-0.72, 0.72].map((z) => (
        <mesh key={z} geometry={GEO.box} material={frame} position={[0, 1.08, z]} scale={[2.04, 0.04, 0.04]} />
      ))}
      {[-0.65, 0, 0.65].map((x, i) => (
        <group key={x} position={[x, 0.3, 0]}>
          <mesh geometry={GEO.blob} material={mat(i % 2 ? 'leafLight' : 'meadow')} position-y={0.2} scale={[0.26, 0.24, 0.42]} />
          <mesh geometry={GEO.ball} material={mat('#C65A4A')} position={[0.1, 0.35, 0.18]} scale={0.05} />
          <mesh geometry={GEO.ball} material={mat('gold')} position={[-0.08, 0.3, -0.2]} scale={0.045} />
        </group>
      ))}
      <mesh geometry={GEO.box} material={mat('woodDark')} position={[1.01, 0.55, 0]} scale={[0.03, 0.7, 0.36]} />
    </group>
  )
}

/**
 * The woodshed's lean-to, 1.0 wide and 0.6 deep: posts at (±0.46, ±0.26), taller at the back than at
 * the open front (+Z), so its roof slopes down to the front, towards the camera, and the logs' ends
 * show under the eave. It stands back right of the farmhouse, beside its log stack (layout.ts
 * WOODSHED), low under the house's eaves.
 */
const SHED = { postX: 0.46, postZ: 0.26, back: 0.82, front: 0.62 }
const shedPitch = Math.atan2(SHED.back - SHED.front, 2 * SHED.postZ)
const LOG = { r: 0.06, length: 0.48 }
/** The woodshed's stack: rows of six and five logs laid along Z, ends out to the front, on bearers 0.06 high. */
const SHED_LOGS: [number, number][] = [6, 5, 6, 5].flatMap((n, row) =>
  Array.from({ length: n }, (_, i): [number, number] => [(i - (n - 1) / 2) * 2 * LOG.r, 0.06 + LOG.r + row * Math.sqrt(3) * LOG.r]),
)
const shedLogs = mergeGeometries(SHED_LOGS.map(([x, y]) => new THREE.CylinderGeometry(LOG.r, LOG.r, LOG.length, 6).rotateX(Math.PI / 2).translate(x, y, 0)))!
const shedLogEnds = mergeGeometries(SHED_LOGS.map(([x, y]) => new THREE.CircleGeometry(LOG.r * 0.8, 6).translate(x, y, LOG.length / 2 + 0.003)))!

export function Woodshed({ position, rotation }: { position: V3; rotation: number }) {
  return (
    <group position={position} rotation-y={rotation}>
      <Asset id="woodshed" fallback={<WoodshedShell />} />
    </group>
  )
}

/** A lean-to roof on four posts over a stack of logs, in the timber and roof colours of the farmhouse and the well. */
function WoodshedShell() {
  const { postX, postZ, back, front } = SHED
  return (
    <group>
      {[-0.15, 0.15].map((z) => (
        <mesh key={z} geometry={GEO.box} material={mat('wood')} position={[0, 0.03, z]} scale={[0.96, 0.06, 0.08]} receiveShadow />
      ))}
      <mesh geometry={shedLogs} material={mat('woodDark')} castShadow receiveShadow />
      <mesh geometry={shedLogEnds} material={mat('woodLight')} />
      {[-postX, postX].map((x) =>
        [
          [-postZ, back],
          [postZ, front],
        ].map(([z, h]) => <mesh key={`${x}${z}`} geometry={GEO.box} material={mat('woodDark')} position={[x, h / 2, z]} scale={[0.07, h, 0.07]} castShadow />),
      )}
      {/* A beam across each pair of posts, and the roof resting on the two. */}
      <mesh geometry={GEO.box} material={mat('woodDark')} position={[0, back - 0.035, -postZ]} scale={[2 * postX + 0.07, 0.07, 0.07]} />
      <mesh geometry={GEO.box} material={mat('woodDark')} position={[0, front - 0.035, postZ]} scale={[2 * postX + 0.07, 0.07, 0.07]} />
      <mesh
        geometry={GEO.box}
        material={mat('roof')}
        position={[0, (back + front) / 2 + 0.025 / Math.cos(shedPitch), 0]}
        rotation-x={shedPitch}
        scale={[2 * postX + 0.24, 0.05, 0.8 / Math.cos(shedPitch)]}
        castShadow
        receiveShadow
      />
    </group>
  )
}

export function Well({ position }: { position: V3 }) {
  return (
    <group position={position} rotation-y={WELL_ROT}>
      <Asset
        id="well"
        fallback={
          <>
            <mesh geometry={GEO.cyl} material={mat('stone')} position-y={0.24} scale={[0.42, 0.48, 0.42]} castShadow receiveShadow />
            <mesh geometry={GEO.cyl} material={mat('waterDeep')} position-y={0.49} scale={[0.32, 0.01, 0.32]} />
            {[-0.36, 0.36].map((x) => (
              <mesh key={x} geometry={GEO.box} material={mat('woodDark')} position={[x, 0.75, 0]} scale={[0.07, 0.8, 0.07]} castShadow />
            ))}
            <mesh geometry={GEO.cyl6} material={mat('wood')} position-y={0.95} rotation-z={Math.PI / 2} scale={[0.05, 0.72, 0.05]} />
            <mesh geometry={wellRoof} material={mat('roof')} position-y={1.12} castShadow />
            <mesh geometry={GEO.cyl} material={mat('wood')} position={[0.1, 0.7, 0]} scale={[0.07, 0.1, 0.07]} />
          </>
        }
      />
    </group>
  )
}

export function Beehive({ position, seed = 1 }: { position: V3; seed?: number }) {
  const bees = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const g = bees.current
    if (!g) return
    g.children.forEach((b, i) => {
      const at = beeAt(i, seed, clock.elapsedTime)
      b.position.set(at.x, at.y, at.z)
      b.rotation.y = at.heading
    })
  })
  return (
    <group position={position} rotation-y={seed}>
      <Asset
        id="beehive"
        fallback={
          <>
            <mesh geometry={GEO.box} material={mat('woodDark')} position-y={0.08} scale={[0.36, 0.16, 0.36]} />
            <mesh geometry={GEO.box} material={mat('cream')} position-y={0.27} scale={[0.4, 0.2, 0.4]} castShadow />
            <mesh geometry={GEO.box} material={mat('gold')} position-y={0.46} scale={[0.4, 0.18, 0.4]} castShadow />
            <mesh geometry={hiveRoof} material={mat('roofDark')} position-y={0.55} />
            <mesh geometry={GEO.box} material={mat('soilDark')} position={[0, 0.22, 0.2]} scale={[0.12, 0.04, 0.02]} />
          </>
        }
      />
      <group ref={bees}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} geometry={beeGeometry} material={vertexMat} />
        ))}
      </group>
    </group>
  )
}

export function Bench({ position, rotation }: { position: V3; rotation: number }) {
  return (
    <group position={position} rotation-y={rotation}>
      <Asset
        id="bench"
        fallback={
          <>
            <mesh geometry={GEO.box} material={mat('woodLight')} position-y={0.32} scale={[1.0, 0.06, 0.32]} castShadow receiveShadow />
            <mesh geometry={GEO.box} material={mat('woodLight')} position={[0, 0.58, -0.15]} rotation-x={-0.15} scale={[1.0, 0.24, 0.05]} castShadow />
            {[-0.42, 0.42].map((x) => (
              <mesh key={x} geometry={GEO.box} material={mat('woodDark')} position={[x, 0.16, 0]} scale={[0.06, 0.32, 0.3]} />
            ))}
          </>
        }
      />
    </group>
  )
}

export function Lantern({ position }: { position: V3 }) {
  return (
    <group position={position}>
      <Asset
        id="lantern"
        fallback={
          <>
            {/* Its arm tops out where the model's does, at 0.82. */}
            <mesh geometry={GEO.box} material={mat('woodDark')} position-y={0.45} scale={[0.06, 0.9, 0.06]} castShadow />
            <mesh geometry={GEO.box} material={mat('woodDark')} position={[0.1, 0.8, 0]} scale={[0.22, 0.04, 0.04]} />
            <mesh geometry={GEO.box} material={glowMat} position={[0.18, 0.64, 0]} scale={[0.13, 0.17, 0.13]} />
            <mesh geometry={GEO.cone} material={mat('ink')} position={[0.18, 0.76, 0]} scale={[0.12, 0.08, 0.12]} />
          </>
        }
      />
    </group>
  )
}

const SCARECROW_PLACE = { scale: SCARECROW_SCALE }

export function Scarecrow({ position }: { position: V3 }) {
  return (
    <group position={position} rotation-y={SCARECROW_TURN}>
      <Asset
        id="scarecrow"
        place={SCARECROW_PLACE}
        fallback={
          <>
            <mesh geometry={GEO.box} material={mat('woodDark')} position-y={0.6} scale={[0.06, 1.2, 0.06]} castShadow />
            <mesh geometry={GEO.box} material={mat('woodDark')} position-y={0.85} scale={[0.85, 0.05, 0.05]} />
            <mesh geometry={GEO.box} material={mat('dusty')} position-y={0.82} scale={[0.36, 0.38, 0.18]} castShadow />
            <mesh geometry={GEO.box} material={mat('cream')} position={[0, 0.85, 0.095]} scale={[0.14, 0.1, 0.01]} />
            <mesh geometry={GEO.ball} material={mat('wallShade')} position-y={1.18} scale={0.15} castShadow />
            <mesh geometry={GEO.cone} material={mat('wood')} position-y={1.36} scale={[0.22, 0.2, 0.22]} />
            <mesh geometry={GEO.cyl} material={mat('wood')} position-y={1.27} scale={[0.26, 0.015, 0.26]} />
          </>
        }
      />
    </group>
  )
}

const groundAt = ([x, z]: XZ, lift = 0): V3 => [x, MAIN.height(x, z) + lift, z]

/** A low timber fence from one point to another, following the ground. */
export function FenceRun({ from, to }: { from: XZ; to: XZ }) {
  const parts = useMemo(() => {
    const dx = to[0] - from[0]
    const dz = to[1] - from[1]
    const len = Math.hypot(dx, dz)
    const n = Math.max(1, Math.round(len / 0.62))
    const angle = Math.atan2(dx, dz)
    const posts = Array.from({ length: n + 1 }, (_, i) => groundAt([from[0] + (dx * i) / n, from[1] + (dz * i) / n]))
    const rails = Array.from({ length: n }, (_, i) => {
      const a = posts[i]
      const b = posts[i + 1]
      return { p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] as V3, len: len / n }
    })
    return { posts, rails, angle }
  }, [from, to])
  return (
    <group>
      {parts.posts.map((p, i) => (
        <mesh key={i} geometry={GEO.box} material={mat('woodDark')} position={[p[0], p[1] + 0.22, p[2]]} scale={[0.07, 0.46, 0.07]} castShadow />
      ))}
      {parts.rails.map((r, i) =>
        [0.16, 0.34].map((h) => (
          <mesh key={`${i}-${h}`} geometry={GEO.box} material={mat('wood')} position={[r.p[0], r.p[1] + h, r.p[2]]} rotation-y={parts.angle} scale={[0.04, 0.05, r.len]} castShadow />
        )),
      )}
    </group>
  )
}

const stoneGeo = new THREE.CylinderGeometry(1, 1.08, 1, 7)

/** Flat stepping stones along a winding line. */
export function SteppingStones({ points, seed = 1 }: { points: XZ[]; seed?: number }) {
  const stones = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)))
    const n = Math.max(2, Math.round(curve.getLength() / 0.42))
    const r = rng(seed * 19)
    return Array.from({ length: n + 1 }, (_, i) => {
      const p = curve.getPointAt(i / n)
      return { p: groundAt([p.x + (r() - 0.5) * 0.1, p.z + (r() - 0.5) * 0.1], 0.015), s: 0.13 + r() * 0.06, rot: r() * 3, c: r() > 0.5 ? 'stone' : 'stoneDark' }
    })
  }, [points, seed])
  return (
    <group>
      {stones.map((s, i) => (
        <mesh key={i} geometry={stoneGeo} material={mat(s.c)} position={s.p} rotation-y={s.rot} scale={[s.s, 0.05, s.s * 0.85]} receiveShadow />
      ))}
    </group>
  )
}

/** A soft dirt track, drawn as a ribbon that hugs the ground. */
export function DirtPath({ points, width = 0.55 }: { points: XZ[]; width?: number }) {
  const geometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)))
    const steps = Math.max(8, Math.round(curve.getLength() * 6))
    const pos: number[] = []
    const idx: number[] = []
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const p = curve.getPointAt(t)
      const tan = curve.getTangentAt(t)
      const w = width * (0.85 + Math.sin(t * 9) * 0.12) * (i === 0 || i === steps ? 0.6 : 1)
      const sx = -tan.z * (w / 2)
      const sz = tan.x * (w / 2)
      for (const [x, z] of [[p.x + sx, p.z + sz], [p.x - sx, p.z - sz]]) pos.push(x, MAIN.height(x, z) + 0.025, z)
      if (i < steps) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  }, [points, width])
  return <mesh geometry={geometry} material={mat('path', { side: THREE.DoubleSide })} receiveShadow />
}

const beamMat = new THREE.MeshBasicMaterial({ color: '#FFE7B0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
const beamGeo = new THREE.ConeGeometry(0.9, 7, 16, 1, true)
beamGeo.translate(0, -3.5, 0)
beamGeo.rotateZ(Math.PI / 2)

export function Lighthouse({ position }: { position: V3 }) {
  const beam = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (beam.current) beam.current.rotation.y = clock.elapsedTime * 0.35
    beamMat.opacity = Math.max(0, sky.current.glow - 0.3) * 0.07
  })
  const [beamAt, setBeamAt] = useState<V3>([0, 3.05, 0])
  const onLoad = useCallback((root: THREE.Object3D) => {
    const node = root.getObjectByName('Beam')
    if (node) setBeamAt(node.position.toArray() as V3)
  }, [])
  return (
    <group position={position}>
      <Asset id="lighthouse" fallback={<LighthouseShell />} onLoad={onLoad} />
      <group ref={beam} position={beamAt}>
        <mesh geometry={beamGeo} material={beamMat} />
      </group>
    </group>
  )
}

function LighthouseShell() {
  return (
    <group>
      <mesh geometry={GEO.cyl} material={mat('stoneDark')} position-y={0.12} scale={[0.75, 0.24, 0.75]} receiveShadow />
      {[0, 1, 2, 3, 4].map((i) => {
        const r0 = 0.55 - i * 0.05
        return (
          <mesh key={i} position-y={0.24 + i * 0.5 + 0.25} castShadow>
            <cylinderGeometry args={[r0 - 0.05, r0, 0.5, 9]} />
            <meshLambertMaterial color={i % 2 ? '#C98268' : '#F5F0E6'} flatShading />
          </mesh>
        )
      })}
      <mesh geometry={GEO.cyl} material={mat('ink')} position-y={2.78} scale={[0.42, 0.06, 0.42]} />
      <mesh geometry={GEO.cyl6} material={glowMat} position-y={3.05} scale={[0.24, 0.45, 0.24]} />
      <mesh geometry={GEO.cone} material={mat('roofDark')} position-y={3.45} scale={[0.36, 0.38, 0.36]} castShadow />
    </group>
  )
}

/**
 * Planks slung between two islands, with rope rails. While it's being laid
 * (`laid` below 1), the planks reach out from `from` and the rails go up last.
 */
export function SkyBridge({ from, to, sag = 0.35, laid = 1 }: { from: THREE.Vector3; to: THREE.Vector3; sag?: number; laid?: number }) {
  const parts = useMemo(() => {
    const dir = to.clone().sub(from)
    const len = dir.length()
    const n = Math.max(4, Math.round(len / 0.32))
    const angle = Math.atan2(dir.x, dir.z)
    const at = (t: number) => from.clone().lerp(to, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0))
    const planks = Array.from({ length: n }, (_, i) => {
      const t = (i + 0.5) / n
      const a = at(t - 0.5 / n)
      const b = at(t + 0.5 / n)
      return { p: at(t), pitch: Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z)) }
    })
    const side = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle)).multiplyScalar(0.34)
    const ropes = [side, side.clone().negate()].map((off) => {
      const pts = Array.from({ length: 12 }, (_, i) => at(i / 11).add(off).add(new THREE.Vector3(0, 0.42, 0)))
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.018, 4)
    })
    const posts = [0, 1].flatMap((t) => [side, side.clone().negate()].map((off) => at(t).add(off)))
    return { planks, angle, ropes, posts }
  }, [from, to, sag])
  const done = laid >= 1
  const planks = done ? parts.planks.length : Math.ceil(Math.max(0, laid) * parts.planks.length)
  return (
    <group>
      {parts.planks.slice(0, planks).map((p, i) => (
        <mesh key={i} geometry={GEO.box} material={mat(i % 3 ? 'wood' : 'woodLight')} position={p.p} rotation={[-p.pitch, parts.angle, 0, 'YXZ']} scale={[0.66, 0.05, 0.26]} castShadow receiveShadow />
      ))}
      {done &&
        parts.ropes.map((g, i) => (
          <mesh key={i} geometry={g} material={mat('woodLight')} />
        ))}
      {parts.posts.map(
        // The first two posts stand at `from`, the last two at `to`.
        (p, i) =>
          (done || i < 2) && (
            <mesh key={`p${i}`} geometry={GEO.box} material={mat('woodDark')} position={[p.x, p.y + 0.22, p.z]} scale={[0.07, 0.5, 0.07]} castShadow />
          ),
      )}
    </group>
  )
}

export function Shelter({ position, rotation = 0 }: { position: V3; rotation?: number }) {
  return (
    <group position={position} rotation-y={rotation}>
      <Asset id="shelter" fallback={<ShelterShell />} />
    </group>
  )
}

/** A pitched roof on four posts over a bale of hay. */
function ShelterShell() {
  return (
    <>
      {[[-0.65, -0.5], [0.65, -0.5], [-0.65, 0.5], [0.65, 0.5]].map(([x, z], i) => (
        <mesh key={i} geometry={GEO.box} material={mat('woodDark')} position={[x, 0.45, z]} scale={[0.07, 0.9, 0.07]} castShadow />
      ))}
      <mesh geometry={shelterRoof} material={mat('roof')} position-y={0.88} castShadow />
      <mesh geometry={GEO.box} material={mat('gold')} position={[0.2, 0.18, -0.15]} scale={[0.55, 0.32, 0.4]} castShadow />
    </>
  )
}

export function Haystack({ position, rotation = 0 }: { position: V3; rotation?: number }) {
  return (
    <group position={position} rotation-y={rotation}>
      <Asset
        id="haystack"
        fallback={
          <>
            <mesh geometry={GEO.blobSoft} material={mat('gold')} position-y={0.3} scale={[0.45, 0.38, 0.45]} castShadow receiveShadow />
            <mesh geometry={GEO.cone} material={mat('#D9AE62')} position-y={0.72} scale={[0.3, 0.3, 0.3]} />
          </>
        }
      />
    </group>
  )
}

export function Mushrooms({ position, seed = 1 }: { position: V3; seed?: number }) {
  const r = useMemo(() => rng(seed), [seed])
  const caps = useMemo(() => Array.from({ length: 3 }, () => ({ x: (r() - 0.5) * 0.3, z: (r() - 0.5) * 0.3, s: 0.6 + r() * 0.5 })), [r])
  return (
    <group position={position}>
      {caps.map((c, i) => (
        <group key={i} position={[c.x, 0, c.z]} scale={c.s}>
          <mesh geometry={GEO.cyl6} material={mat('cream')} position-y={0.06} scale={[0.025, 0.12, 0.025]} />
          <mesh geometry={GEO.ball} material={mat(i % 2 ? 'terracotta' : '#B8584A')} position-y={0.13} scale={[0.08, 0.045, 0.08]} />
        </group>
      ))}
    </group>
  )
}

export function Log({ position, rotation = 0 }: { position: V3; rotation?: number }) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh geometry={GEO.cyl6} material={mat('woodDark')} position-y={0.14} rotation-z={Math.PI / 2} scale={[0.14, 0.9, 0.14]} castShadow />
      <mesh geometry={GEO.cyl6} material={mat('woodLight')} position={[0.452, 0.14, 0]} rotation-z={Math.PI / 2} scale={[0.12, 0.01, 0.12]} />
    </group>
  )
}
