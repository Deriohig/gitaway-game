import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useCallback, useMemo, useRef, useState } from 'react'
import { Asset } from './Asset'
import { glowMat, mat } from './materials'
import { GEO } from './Nature'
import { sky } from './skyRef'

function prism(width: number, depth: number, height: number): THREE.BufferGeometry {
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

const roofGeo = prism(2.55, 2.2, 1.05)
const shedRoofGeo = prism(1.0, 1.25, 0.45)

function Window({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh geometry={GEO.box} material={mat('woodLight')} scale={[0.46, 0.46, 0.04]} />
      <mesh geometry={GEO.box} material={glowMat} position-z={0.02} scale={[0.36, 0.36, 0.03]} />
      <mesh geometry={GEO.box} material={mat('woodLight')} position-z={0.04} scale={[0.04, 0.36, 0.02]} />
      <mesh geometry={GEO.box} material={mat('woodLight')} position-z={0.04} scale={[0.36, 0.04, 0.02]} />
      <mesh geometry={GEO.box} material={mat('woodDark')} position={[0, -0.27, 0.06]} scale={[0.5, 0.1, 0.14]} />
      <mesh geometry={GEO.ball} material={mat('terracotta')} position={[-0.12, -0.2, 0.08]} scale={0.05} />
      <mesh geometry={GEO.ball} material={mat('gold')} position={[0.02, -0.19, 0.09]} scale={0.05} />
      <mesh geometry={GEO.ball} material={mat('blossom')} position={[0.15, -0.2, 0.08]} scale={0.05} />
    </group>
  )
}

function Smoke() {
  const puffs = useRef<THREE.Mesh[]>([])
  const materials = useMemo(
    () => Array.from({ length: 5 }, () => new THREE.MeshLambertMaterial({ color: '#F4EFE6', transparent: true, depthWrite: false })),
    [],
  )
  useFrame(({ clock }) => {
    const t0 = clock.elapsedTime * 0.11
    puffs.current.forEach((m, i) => {
      if (!m) return
      const t = (t0 + i / puffs.current.length) % 1
      m.position.set(t * 0.55 + Math.sin(t * 6 + i) * 0.06, t * 1.9, -t * 0.25)
      m.scale.setScalar(0.1 + t * 0.32)
      ;(m.material as THREE.MeshLambertMaterial).opacity = Math.sin(Math.PI * Math.min(1, t * 1.4)) * 0.55
    })
  })
  return (
    <group>
      {materials.map((m, i) => (
        <mesh key={i} ref={(el) => void (puffs.current[i] = el!)} geometry={GEO.blobSoft} material={m} />
      ))}
    </group>
  )
}

type V3 = [number, number, number]

function PorchLight({ position }: { position: V3 }) {
  const light = useRef<THREE.PointLight>(null)
  useFrame(() => {
    if (light.current) light.current.intensity = sky.current.glow * 2.2
  })
  return <pointLight ref={light} position={position} color="#F6BE72" distance={5.5} decay={1.6} intensity={0} />
}

const CHIMNEY_TOP: V3 = [0.62, 2.85, -0.42]
const PORCH_LAMP: V3 = [0, 1.15, 1.45]

/** The farmhouse model (or its stand-in), chimney smoke, and the porch light. */
export function Farmhouse({ position, rotation }: { position: V3; rotation: number }) {
  const [smokeAt, setSmokeAt] = useState(CHIMNEY_TOP)
  const [lampAt, setLampAt] = useState(PORCH_LAMP)
  const onLoad = useCallback((root: THREE.Object3D) => {
    // The model's own anchors (empties), where it has them.
    const smoke = root.getObjectByName('Smoke')
    if (smoke) setSmokeAt(smoke.position.toArray() as V3)
    const lamp = root.getObjectByName('PorchLight')
    if (lamp) setLampAt(lamp.position.toArray() as V3)
  }, [])
  return (
    <group position={position} rotation-y={rotation}>
      <Asset id="farmhouse" fallback={<FarmhouseShell />} onLoad={onLoad} />
      <group position={smokeAt}>
        <Smoke />
      </group>
      <PorchLight position={lampAt} />
    </group>
  )
}

function FarmhouseShell() {
  return (
    <group>
      {/* foundation and walls */}
      <mesh geometry={GEO.box} material={mat('stoneDark')} position-y={0.1} scale={[2.3, 0.22, 1.9]} castShadow receiveShadow />
      <mesh geometry={GEO.box} material={mat('wall')} position-y={0.86} scale={[2.1, 1.32, 1.7]} castShadow receiveShadow />
      {/* timber corner posts */}
      {[[-1.04, 0.84], [1.04, 0.84], [-1.04, -0.84], [1.04, -0.84]].map(([x, z], i) => (
        <mesh key={i} geometry={GEO.box} material={mat('woodDark')} position={[x, 0.86, z]} scale={[0.1, 1.32, 0.1]} />
      ))}
      {/* roof */}
      <mesh geometry={roofGeo} material={mat('roof')} position-y={1.5} castShadow receiveShadow />
      <mesh geometry={GEO.box} material={mat('roofDark')} position-y={2.55} scale={[2.6, 0.08, 0.14]} />
      {/* chimney */}
      <group position={[CHIMNEY_TOP[0], 0, CHIMNEY_TOP[2]]}>
        <mesh geometry={GEO.box} material={mat('stone')} position-y={2.25} scale={[0.32, 1.0, 0.32]} castShadow />
        <mesh geometry={GEO.box} material={mat('roofDark')} position-y={2.78} scale={[0.4, 0.08, 0.4]} />
      </group>
      {/* front: door, windows, porch */}
      <mesh geometry={GEO.box} material={mat('woodDark')} position={[0, 0.62, 0.86]} scale={[0.44, 0.8, 0.05]} />
      <mesh geometry={GEO.ball} material={mat('gold')} position={[0.13, 0.6, 0.9]} scale={0.03} />
      <Window position={[-0.62, 0.95, 0.86]} />
      <Window position={[0.62, 0.95, 0.86]} />
      <Window position={[1.06, 0.95, 0.2]} rotation={Math.PI / 2} />
      <Window position={[-1.06, 0.95, -0.2]} rotation={-Math.PI / 2} />
      <mesh geometry={GEO.box} material={mat('woodLight')} position={[0, 0.2, 1.22]} scale={[1.4, 0.08, 0.66]} receiveShadow castShadow />
      <mesh geometry={GEO.box} material={mat('woodLight')} position={[0, 0.08, 1.64]} scale={[0.7, 0.08, 0.26]} receiveShadow />
      {[-0.62, 0.62].map((x) => (
        <mesh key={x} geometry={GEO.box} material={mat('woodDark')} position={[x, 0.75, 1.5]} scale={[0.07, 1.05, 0.07]} castShadow />
      ))}
      <mesh geometry={GEO.box} material={mat('terracotta')} position={[0, 1.3, 1.22]} rotation-x={0.35} scale={[1.55, 0.06, 0.82]} castShadow />
      {/* lean-to shed on the side */}
      <group position={[-1.55, 0, 0.1]}>
        <mesh geometry={GEO.box} material={mat('woodLight')} position-y={0.5} scale={[0.95, 0.9, 1.1]} castShadow receiveShadow />
        <mesh geometry={shedRoofGeo} material={mat('roofDark')} position-y={0.95} castShadow />
        <mesh geometry={GEO.box} material={mat('woodDark')} position={[0, 0.45, 0.56]} scale={[0.5, 0.65, 0.03]} />
      </group>
      {/* firewood stack */}
      <group position={[1.35, 0, -0.55]}>
        {[0, 1, 2].map((row) =>
          Array.from({ length: 3 - row }, (_, i) => (
            <mesh key={`${row}-${i}`} geometry={GEO.cyl6} material={mat(i % 2 ? 'woodLight' : 'wood')} position={[0, 0.1 + row * 0.17, -0.18 + i * 0.18 + row * 0.09]} rotation-z={Math.PI / 2} scale={[0.08, 0.5, 0.08]} castShadow />
          )),
        )}
      </group>
    </group>
  )
}
