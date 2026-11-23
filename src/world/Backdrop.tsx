import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { mat, vertexMat } from './materials'
import { useMotion } from './motion'
import { RoundTree } from './Nature'
import { rng } from './random'
import { sky } from './skyRef'
import { makeIsland } from './terrain'

// What surrounds the farm in 3D: a sea of clouds below, a few clouds and
// distant islands drifting behind, and the odd passing flock. The mountains,
// sun, moon and stars are painted into the sky behind the canvas (SkyArt),
// because the camera looks down on the island and never sees the horizon.

const cloudGeo = new THREE.IcosahedronGeometry(1, 2)
const cloudMat = new THREE.MeshLambertMaterial({ color: '#FBF5EA', emissive: new THREE.Color('#6A6478'), emissiveIntensity: 0.22 })

/** The direction the camera looks from (towards +x/+z). */
const CAMERA_ANGLE = Math.PI / 4

interface CloudFieldProps {
  count: number
  inner: number
  outer: number
  y: [number, number]
  scale: number
  seed: number
  speed: number
  /** Optional arc to keep clouds in, as [center angle, half width]. */
  arc?: [number, number]
}

function CloudField({ count, inner, outer, y, scale, seed, speed, arc }: CloudFieldProps) {
  const group = useRef<THREE.Group>(null)
  const mesh = useRef<THREE.InstancedMesh>(null)
  const total = count * 4
  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    const r = rng(seed)
    const mtx = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    let n = 0
    for (let tries = 0; n < total && tries < count * 10; tries++) {
      const a = arc ? arc[0] + (r() * 2 - 1) * arc[1] : r() * Math.PI * 2
      const d = inner + r() * (outer - inner)
      // Keep big puffs out of the camera's face.
      const nearCamera = Math.abs(Math.atan2(Math.sin(a - CAMERA_ANGLE), Math.cos(a - CAMERA_ANGLE))) < 1.15 && d < 42
      if (nearCamera) continue
      const cx = Math.cos(a) * d
      const cz = Math.sin(a) * d
      const cy = y[0] + r() * (y[1] - y[0])
      const k = scale * (0.7 + r() * 0.8)
      for (let j = 0; j < 4; j++) {
        const s = k * (0.6 + r() * 0.6) * (j === 0 ? 1.3 : 1)
        q.setFromEuler(new THREE.Euler(0, r() * Math.PI, 0))
        mtx.compose(new THREE.Vector3(cx + (r() - 0.5) * k * 2.4, cy + (r() - 0.3) * k * 0.3, cz + (r() - 0.5) * k * 1.6), q, new THREE.Vector3(s, s * 0.42, s * 0.8))
        m.setMatrixAt(n++, mtx)
      }
    }
    m.count = n
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [count, total, inner, outer, y, scale, seed, arc])
  useFrame(({ clock }, dt) => {
    const g = group.current
    if (!g) return
    // Clouds behind the island drift back and forth; the cloud sea slowly circles it.
    if (arc) g.rotation.y = Math.sin(clock.elapsedTime * 0.015) * 0.2
    else g.rotation.y += Math.min(dt, 0.1) * speed
  })
  return (
    <group ref={group}>
      <instancedMesh ref={mesh} args={[cloudGeo, cloudMat, total]} frustumCulled={false} />
    </group>
  )
}

const FAR_ARC: [number, number] = [-2.36, 1.0]
const CLOUD_SEA_Y: [number, number] = [-14, -10.5]
const DRIFT_Y: [number, number] = [-7, -2]

function DistantIsles() {
  const isles = useMemo(
    () =>
      [
        { seed: 101, r: 2.2, p: [-30, -9, -26] },
        { seed: 102, r: 1.4, p: [-12, -5, -40] },
        { seed: 103, r: 2.6, p: [26, -13, -36] },
        { seed: 104, r: 1.2, p: [-40, -15, 4] },
      ].map((d) => ({ ...d, island: makeIsland({ seed: d.seed, radius: d.r, hills: 0.4, depth: 0.7, flatCenter: 0.3 }) })),
    [],
  )
  const refs = useRef<(THREE.Group | null)[]>([])
  useFrame(({ clock }) => {
    refs.current.forEach((g, i) => {
      if (g) g.position.y = isles[i].p[1] + Math.sin(clock.elapsedTime * 0.12 + i * 1.7) * 0.4
    })
  })
  return (
    <group>
      {isles.map((d, i) => (
        <group key={d.seed} ref={(el) => void (refs.current[i] = el)} position={d.p as [number, number, number]}>
          <mesh geometry={d.island.geometry} material={vertexMat} />
          <RoundTree position={[0.2, d.island.height(0.2, 0.1) - 0.05, 0.1]} scale={d.r * 0.45} seed={d.seed} />
        </group>
      ))}
    </group>
  )
}

const wingGeo = (() => {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.12, 0, 0, -0.12, 0.55, 0.05, 0], 3))
  g.computeVertexNormals()
  return g
})()

/** Now and then a small flock drifts across, behind the island. */
function Birds() {
  const flock = useRef<THREE.Group>(null)
  const wings = useRef<THREE.Mesh[]>([])
  const birds = [[0, 0, 0], [-0.9, -0.2, 0.7], [-0.9, 0.1, -0.8], [-1.8, -0.1, 1.3]] as const
  useFrame(({ clock }) => {
    const g = flock.current
    if (!g) return
    const t = (clock.elapsedTime % 75) / 24 // crosses in 24s, then a long pause
    g.visible = t < 1 && !sky.current.isNight
    const s = THREE.MathUtils.lerp(-30, 30, t)
    g.position.set(s * 0.72 - 7, 3.5 + Math.sin(t * 6) * 0.5, -s * 0.72 - 7)
    wings.current.forEach((w, i) => {
      if (w) w.rotation.z = Math.sin(clock.elapsedTime * 7 + i) * 0.55 * (i % 2 ? 1 : -1)
    })
  })
  return (
    <group ref={flock} rotation-y={-Math.PI / 4}>
      {birds.map(([x, y, z], i) => (
        <group key={i} position={[x * 0.6, y * 0.6, z * 0.6]} scale={0.6}>
          <mesh ref={(el) => void (wings.current[i * 2] = el!)} geometry={wingGeo} material={mat('ink', { side: THREE.DoubleSide })} />
          <mesh ref={(el) => void (wings.current[i * 2 + 1] = el!)} geometry={wingGeo} material={mat('ink', { side: THREE.DoubleSide })} rotation-y={Math.PI} />
        </group>
      ))}
    </group>
  )
}

export function Backdrop() {
  const motion = useMotion()
  return (
    <group>
      <CloudField count={motion === 'calm' ? 28 : 36} inner={12} outer={80} y={CLOUD_SEA_Y} scale={2.3} seed={12} speed={0.006} />
      <CloudField count={5} inner={30} outer={52} y={DRIFT_Y} scale={2.0} seed={29} speed={0} arc={FAR_ARC} />
      <DistantIsles />
      {motion === 'full' && <Birds />}
    </group>
  )
}
