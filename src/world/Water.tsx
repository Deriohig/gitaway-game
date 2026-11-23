import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { loadCompositionReeds } from './composition'
import type { Reed } from './isleSpots'
import { LEGACY_POND, MAIN, POND_LEVEL, STREAM_THETA } from './layout'
import { mat } from './materials'
import { useMotion } from './motion'
import { GEO, Rock } from './Nature'
import { PALETTE } from './palette'
import { rng } from './random'
import { Reeds } from './Reeds'
import { sky } from './skyRef'
import { driveWater } from './water/driver'
import { fallMist, legacyPondLocal, pondDressing, streamPath, teardropReeds, type DressingMode } from './water/pondDressing'

const shared = {
  uTime: { value: 0 },
  /** Overall brightness, so the water dims with the evening like everything else. */
  uLight: { value: 1 },
  uSky: { value: new THREE.Color(PALETTE.sky) },
  uDeep: { value: new THREE.Color(PALETTE.waterDeep) },
  uShallow: { value: new THREE.Color(PALETTE.water) },
  uFoam: { value: new THREE.Color(PALETTE.foam) },
}

const pondMat = new THREE.ShaderMaterial({
  transparent: true,
  uniforms: { ...shared, uRadius: { value: LEGACY_POND.r } },
  vertexShader: /* glsl */ `
    varying vec2 vP;
    void main() {
      vP = position.xy;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float uTime; uniform float uRadius; uniform float uLight;
    uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uFoam; uniform vec3 uSky;
    varying vec2 vP;
    void main() {
      float d = length(vP) / uRadius;
      vec3 col = mix(uDeep, uShallow, smoothstep(0.05, 1.0, d));
      col = mix(col, uSky, 0.25);
      float w1 = sin(vP.x * 3.1 + uTime * 0.8) * sin(vP.y * 2.6 - uTime * 0.6);
      float w2 = sin((vP.x + vP.y) * 4.2 - uTime * 1.1);
      float glint = smoothstep(0.72, 1.0, w1 * 0.6 + w2 * 0.4);
      col += uFoam * glint * 0.14;
      float ring = sin(d * 16.0 - uTime * 0.9) * 0.5 + 0.5;
      col += uFoam * ring * smoothstep(0.55, 0.9, d) * 0.04;
      col = mix(col, uFoam, smoothstep(0.86, 1.0, d) * 0.5);
      gl_FragColor = vec4(col * uLight, 0.94);
      #include <colorspace_fragment>
    }`,
})

const streamMat = new THREE.ShaderMaterial({
  transparent: true,
  uniforms: shared,
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float uTime; uniform float uLight; uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uFoam; uniform vec3 uSky;
    varying vec2 vUv;
    void main() {
      float edge = abs(vUv.y - 0.5) * 2.0;
      vec3 col = mix(uDeep, uShallow, edge);
      col = mix(col, uSky, 0.25);
      float flow = sin(vUv.x * 36.0 - uTime * 2.6 + sin(vUv.y * 9.0) * 1.2);
      col += uFoam * smoothstep(0.7, 1.0, flow) * 0.18;
      col = mix(col, uFoam, smoothstep(0.75, 1.0, edge) * 0.4);
      gl_FragColor = vec4(col * uLight, 0.95);
      #include <colorspace_fragment>
    }`,
})

const fallMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  uniforms: shared,
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float uTime; uniform float uLight; uniform vec3 uShallow; uniform vec3 uFoam; uniform vec3 uSky;
    varying vec2 vUv;
    void main() {
      float streak = fract(vUv.y * 2.4 + uTime * 0.55 + sin(vUv.x * 17.0) * 0.12);
      float s = smoothstep(0.0, 0.25, streak) * (1.0 - smoothstep(0.55, 1.0, streak));
      vec3 col = mix(mix(uShallow, uSky, 0.35), uFoam, s * 0.55 + 0.15);
      float side = 1.0 - smoothstep(0.7, 1.0, abs(vUv.x - 0.5) * 2.0);
      float alpha = side * smoothstep(0.0, 0.55, vUv.y) * 0.85;
      gl_FragColor = vec4(col * uLight, alpha);
      #include <colorspace_fragment>
    }`,
})

/**
 * Keeps the water's sky tint and ripples moving. Mount once. It also steps the baked water's
 * shared uniforms, the session's one set, once a piece's water has made them (water/driver.ts):
 * from a clock it holds, which stops in Still motion. It never asks for a frame; the Ticker owns
 * the frame rate.
 */
export function WaterDriver() {
  const still = useMotion() === 'still'
  const held = useRef({ t: 0 })
  useFrame(({ clock }, delta) => {
    shared.uTime.value = clock.elapsedTime
    shared.uSky.value.copy(sky.current.mid)
    shared.uLight.value = Math.min(1, 0.32 + sky.current.hemiI * 0.4 + sky.current.sunI * 0.2)
    driveWater(held.current, delta, still, sky.current)
  })
  return null
}

function blob(radius: number, seed: number, points = 22): THREE.Shape {
  const r = rng(seed)
  const shape = new THREE.Shape()
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2
    const rad = radius * (1 + Math.sin(a * 3 + 1.2) * 0.06 + (r() - 0.5) * 0.05)
    if (i === 0) shape.moveTo(Math.cos(a) * rad, Math.sin(a) * rad)
    else shape.lineTo(Math.cos(a) * rad, Math.sin(a) * rad)
  }
  return shape
}

function ribbon(points: THREE.Vector3[], width: (t: number) => number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points)
  const steps = 40
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const p = curve.getPointAt(t)
    const tan = curve.getTangentAt(t)
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize().multiplyScalar(width(t) / 2)
    pos.push(p.x + side.x, p.y, p.z + side.z, p.x - side.x, p.y, p.z - side.z)
    uv.push(t * 6, 0, t * 6, 1)
    if (i < steps) {
      const a = i * 2
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

const ground = (x: number, z: number, lift: number) => new THREE.Vector3(x, MAIN.height(x, z) + lift, z)

// ---------------------------------------------------------------------------
// The farm's pond and stream as the game has always drawn them, round
// LEGACY_POND: the fallback (the water switch off; while the baked water loads,
// or if it fails to) until the baked water, drawn to the art's shore (layout.ts
// POND_SHORE) by water/PieceWater.tsx, replaces their water and the fall's
// sheet. Each part mounts on its own: the water, the dressing
// (water/pondDressing.ts), and the stream's fall (its mist stays with the baked
// water too) and bridge.

/** The old pond's water and its bank, in its own frame. */
function PondWaterParts() {
  const { waterGeo, bankGeo } = useMemo(() => ({ waterGeo: new THREE.ShapeGeometry(blob(LEGACY_POND.r, 3), 1), bankGeo: new THREE.ShapeGeometry(blob(LEGACY_POND.r + 0.32, 4), 1) }), [])
  return (
    <>
      <mesh geometry={bankGeo} material={mat('soilLight')} rotation-x={-Math.PI / 2} position-y={0.03} receiveShadow />
      <mesh geometry={waterGeo} material={pondMat} rotation-x={-Math.PI / 2} position-y={0.06} />
    </>
  )
}

/** The old pond's stones, pads and reeds, in its own frame. */
function PondDressingParts() {
  const { stones, pads, reeds } = useMemo(legacyPondLocal, [])
  return (
    <>
      {stones.map((s, i) => (
        <Rock key={i} position={s.p} lift={0.03} scale={s.s} color={i % 3 ? 'stone' : 'stoneDark'} />
      ))}
      {pads.map((p, i) => (
        <group key={i} position={p}>
          <mesh geometry={GEO.cyl} material={mat('meadow')} scale={[0.17, 0.015, 0.17]} />
          {i === 1 && <mesh geometry={GEO.ball} material={mat('blossom')} position-y={0.04} scale={0.05} />}
        </group>
      ))}
      {reeds.map((p, i) => (
        <mesh key={i} geometry={GEO.cone} material={mat(i % 2 ? 'leafDark' : 'meadow')} position={[p[0], 0.25, p[2]]} scale={[0.03, 0.5 + (i % 3) * 0.12, 0.03]} />
      ))}
    </>
  )
}

/** Something in the old pond's frame: its group, on the ground at LEGACY_POND. */
function AtOldPond({ children }: { children: ReactNode }) {
  const y = MAIN.height(LEGACY_POND.x, LEGACY_POND.z)
  return <group position={[LEGACY_POND.x, y, LEGACY_POND.z]}>{children}</group>
}

/** The farm's pond as the game has always drawn it: its water, its bank and its dressing. */
export function Pond() {
  return (
    <AtOldPond>
      <PondWaterParts />
      <PondDressingParts />
    </AtOldPond>
  )
}

/** The old pond's water and bank alone. */
export function PondWater() {
  return (
    <AtOldPond>
      <PondWaterParts />
    </AtOldPond>
  )
}

let teardropReedsIn: Reed[] | null = null

/**
 * The art's reeds by the Teardrop (pondDressing.ts teardropReeds), once they are in: they come with the composition's
 * items (composition.data.ts, loaded once, the first time either is drawn). Null until then.
 */
function useTeardropReeds(): Reed[] | null {
  const [reeds, setReeds] = useState(teardropReedsIn)
  useEffect(() => {
    if (reeds) return
    let live = true
    void loadCompositionReeds().then((all) => {
      teardropReedsIn ??= teardropReeds(all)
      if (live) setReeds(teardropReedsIn)
    })
    return () => {
      live = false
    }
  }, [reeds])
  return reeds
}

/**
 * The Teardrop's stones on its bank and its lily pads on its surface, in MAIN's frame, and its reeds at its waterline:
 * the art's, drawn as the wetland's are (Reeds.tsx: one draw for their blades, one for their heads).
 */
function TeardropDressing() {
  const { stones, pads } = useMemo(() => pondDressing('v2'), [])
  const reeds = useTeardropReeds()
  return (
    <group>
      {stones.map((s, i) => (
        <Rock key={i} position={[s.x, MAIN.height(s.x, s.z), s.z]} lift={0.03} scale={s.r} turn={s.rot} color={i % 3 ? 'stone' : 'stoneDark'} />
      ))}
      {pads.map((p, i) => (
        <group key={i} position={[p.x, POND_LEVEL + 0.015, p.z]}>
          <mesh geometry={GEO.cyl} material={mat('meadow')} scale={[p.r, 0.015, p.r]} />
          {p.blossom && <mesh geometry={GEO.ball} material={mat('blossom')} position-y={0.04} scale={0.05} />}
        </group>
      ))}
      {reeds && reeds.length > 0 && <Reeds island={MAIN} reeds={reeds} name="pond_reeds" />}
    </group>
  )
}

/** The pond's stones, lily pads and reeds: the old pond's (`legacy`, its spike reeds) or the art's Teardrop's (`v2`, the art's reeds). */
export function PondDressing({ mode }: { mode: DressingMode }) {
  return mode === 'legacy' ? (
    <AtOldPond>
      <PondDressingParts />
    </AtOldPond>
  ) : (
    <TeardropDressing />
  )
}

/** The old stream's water: a flowing ribbon from the old pond to the rim, on a muddy bank. */
export function StreamWater() {
  const { waterGeo, bankGeo } = useMemo(() => {
    const { start, mid1, mid2, end } = streamPath()
    const pts = [start, mid1, mid2].map((v) => ground(v.x, v.y, 0.075))
    pts.push(new THREE.Vector3(end.x, end.y + 0.02, end.z))
    return { waterGeo: ribbon(pts, (t) => 0.42 + t * 0.12), bankGeo: ribbon(pts.map((p) => p.clone().setY(p.y - 0.03)), (t) => 0.72 + t * 0.1) }
  }, [])
  return (
    <>
      <mesh geometry={bankGeo} material={mat('soilLight')} receiveShadow />
      <mesh geometry={waterGeo} material={streamMat} />
    </>
  )
}

/**
 * Where the stream drops off MAIN's rim at STREAM_THETA (the old stream's end and the art's rim exit are the
 * same point): the waterfall and its mist, unless the wetland has docked there and its river carries on instead.
 * `legacy` is today's sheet and mist. With the baked fall (`v2`, drawn with the pond: water/PieceWater.tsx, which
 * retreats it as the wetland docks), only today's mist, moved to the foot of the art's fall (pondDressing.ts
 * fallMist) until PR 5 draws the art's own mist there.
 */
export function StreamFall({ waterfall = true, mode }: { waterfall?: boolean; mode: DressingMode }) {
  const { fallGeo, fallPos, fallRot } = useMemo(() => {
    const { end } = streamPath()
    const out = new THREE.Vector3(Math.cos(STREAM_THETA), 0, Math.sin(STREAM_THETA))
    const fallGeo = new THREE.PlaneGeometry(0.62, 4.6, 1, 14)
    const p = fallGeo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const v = 1 - (p.getY(i) + 2.3) / 4.6 // 0 at the top, 1 at the bottom
      p.setZ(i, Math.sin(Math.min(1, v * 3) * Math.PI * 0.5) * 0.35 + v * 0.25)
    }
    fallGeo.computeVertexNormals()
    const fallPos = end.clone().add(out.clone().multiplyScalar(0.1)).setY(end.y - 2.28)
    const fallRot = Math.atan2(out.x, out.z)
    return { fallGeo, fallPos, fallRot }
  }, [])
  const mist = useMemo(() => fallMist(mode), [mode])
  if (!waterfall) return null
  return (
    <>
      {mode === 'legacy' && <mesh geometry={fallGeo} material={fallMat} position={fallPos} rotation-y={fallRot} />}
      {mist.map((p, i) => (
        <mesh key={i} geometry={GEO.blobSoft} material={mat('cloud', { flat: false })} position={p} scale={0.35 + (i % 2) * 0.15} />
      ))}
    </>
  )
}

/** The stream's footbridge: on the old stream's second bend (`legacy`), or at the art's bridge point (`v2`). */
export function StreamBridge({ mode }: { mode: DressingMode }) {
  const { bridge } = useMemo(() => pondDressing(mode), [mode])
  return <Bridge position={[bridge.x, MAIN.height(bridge.x, bridge.z), bridge.z]} rotation={bridge.rot} />
}

/**
 * The stream from the old pond to the rim. Off the rim it falls as a waterfall,
 * unless the wetland has docked there: then its river carries on instead.
 */
export function Stream({ waterfall = true }: { waterfall?: boolean }) {
  return (
    <group>
      <StreamWater />
      <StreamFall waterfall={waterfall} mode="legacy" />
      <StreamBridge mode="legacy" />
    </group>
  )
}

// ---------------------------------------------------------------------------
// The wild isles' water as the game has always drawn it: in a piece's own
// coordinates, from the blueprint's lakes, rivers and waterfalls (see
// isleSpots.ts). The fallback, as the farm's pond above is, until the piece's
// baked water is drawn in its place (water/PieceWater.tsx, from WildIsles.tsx).

type V3 = [number, number, number]

/** A lake or tarn's surface: its shore polygon, flat at `level`, darker towards its middle like the pond. */
export function Lake({ outline, level, centre, radius }: { outline: readonly [number, number][]; level: number; centre: [number, number]; radius: number }) {
  const { geometry, material } = useMemo(() => {
    // Drawn round its middle, so the pond's shading (deep in the middle, shallow at the shore) works for it too.
    const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x - centre[0], -(z - centre[1]))))
    const geometry = new THREE.ShapeGeometry(shape, 1)
    const material = pondMat.clone()
    material.uniforms = { ...shared, uRadius: { value: radius } }
    return { geometry, material }
  }, [outline, centre, radius])
  return <mesh geometry={geometry} material={material} rotation-x={-Math.PI / 2} position={[centre[0], level, centre[1]]} />
}

/**
 * A river or brook: a flowing ribbon through `points` (x, water height, z), each with its own width, on a
 * muddy bank `bank` wider than the water, as the farm's stream is.
 */
export function Brook({ points, widths, bank = 0.3 }: { points: readonly V3[]; widths: readonly number[]; bank?: number }) {
  const { water, mud } = useMemo(() => {
    const at = (t: number) => {
      const f = t * (widths.length - 1)
      const i = Math.min(widths.length - 2, Math.floor(f))
      return widths[i] + (widths[i + 1] - widths[i]) * (f - i)
    }
    const line = points.map(([x, y, z]) => new THREE.Vector3(x, y, z))
    return { water: ribbon(line, at), mud: ribbon(line.map((p) => p.clone().setY(p.y - 0.03)), (t) => at(t) + bank) }
  }, [points, widths, bank])
  return (
    <>
      <mesh geometry={mud} material={mat('soilLight')} receiveShadow />
      <mesh geometry={water} material={streamMat} />
    </>
  )
}

/**
 * A waterfall down a cliff, through `points` from its lip to the cloud sea, `width` across: it faces out from
 * the cliff, the way the water leaves it, and fades out towards its foot like the farm's own.
 */
export function Fall({ points, width }: { points: readonly V3[]; width: number }) {
  const geometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)))
    const first = points[0]
    const last = points[points.length - 1]
    const out = new THREE.Vector3(last[0] - first[0], 0, last[2] - first[2]).normalize()
    const across = new THREE.Vector3(-out.z, 0, out.x).multiplyScalar(width / 2)
    const steps = 24
    const pos: number[] = []
    const uv: number[] = []
    const idx: number[] = []
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const p = curve.getPointAt(t)
      pos.push(p.x + across.x, p.y, p.z + across.z, p.x - across.x, p.y, p.z - across.z)
      // The fall's shading runs from 1 at the top to 0 at the foot, and 0 to 1 across.
      uv.push(0, 1 - t, 1, 1 - t)
      if (i < steps) {
        const a = i * 2
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  }, [points, width])
  return <mesh geometry={geometry} material={fallMat} />
}

/** A small arched footbridge. */
export function Bridge({ position, rotation, length = 1.5 }: { position: [number, number, number]; rotation: number; length?: number }) {
  const planks = 7
  return (
    <group position={position} rotation-y={rotation}>
      {Array.from({ length: planks }, (_, i) => {
        const t = i / (planks - 1) - 0.5
        const y = 0.2 * (1 - (t * 2) ** 2) + 0.06
        return (
          <mesh key={i} geometry={GEO.box} material={mat(i % 2 ? 'woodLight' : 'wood')} position={[0, y, t * length]} rotation-x={-t * 0.5} scale={[0.62, 0.05, length / planks]} castShadow receiveShadow />
        )
      })}
      {[-0.3, 0.3].map((x) => (
        <group key={x}>
          {[-0.5, 0, 0.5].map((t) => (
            <mesh key={t} geometry={GEO.box} material={mat('woodDark')} position={[x, 0.2 * (1 - (t * 2) ** 2) + 0.25, t * length * 0.9]} scale={[0.05, 0.36, 0.05]} castShadow />
          ))}
          <mesh geometry={GEO.box} material={mat('woodDark')} position={[x, 0.46, 0]} scale={[0.04, 0.04, length * 0.95]} />
        </group>
      ))}
    </group>
  )
}
