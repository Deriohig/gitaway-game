import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { now, subscribeClock } from '../game/clock'
import { useGame } from '../store/game'
import { applySkyCss, hourFor, skyAt } from './skyPalette'
import { setGlow } from './materials'
import { useMotion } from './motion'
import { sky } from './skyRef'

/** How far out from the farm shadows are drawn: the farm itself, unless docked pieces reach further. */
export const SHADOW_REACH = 17

/**
 * Lights, fog and sky colour, following the time of day. Shadows cover
 * `shadowReach` around the farm, so things on docked pieces cast them too.
 */
export function DayCycle({ cameraDistance, shadowReach = SHADOW_REACH }: { cameraDistance: number; shadowReach?: number }) {
  const pref = useGame((s) => s.game.settings.timeOfDay)
  const sun = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)
  const last = useRef(-Infinity)

  const apply = () => {
    const k = skyAt(hourFor(pref, now()))
    sky.current = k
    if (sun.current) {
      sun.current.position.copy(k.lightDir).multiplyScalar(40)
      sun.current.color.copy(k.sun)
      sun.current.intensity = k.sunI
    }
    if (hemi.current) {
      hemi.current.color.copy(k.hemiSky)
      hemi.current.groundColor.copy(k.hemiGround)
      hemi.current.intensity = k.hemiI
    }
    if (scene.fog instanceof THREE.Fog) scene.fog.color.copy(k.fog)
    setGlow(k.glow)
    applySkyCss(k)
  }

  useEffect(() => {
    last.current = -Infinity
    apply()
    invalidate()
  }, [pref])

  // When a development build skips time ahead, the sky follows straight away,
  // even in still mode, which only draws for changes.
  useEffect(
    () =>
      subscribeClock(() => {
        apply()
        invalidate()
      }),
    [pref],
  )

  // Shadows are redrawn every few frames rather than every frame: the sun
  // barely moves and the animals are small, so nobody can tell, and it
  // roughly halves the work per frame.
  const gl = useThree((s) => s.gl)
  const motion = useMotion()
  const frame = useRef(0)
  useEffect(() => {
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
  }, [gl])

  useEffect(() => {
    const cam = sun.current?.shadow.camera
    if (!cam) return
    cam.left = cam.bottom = -shadowReach
    cam.right = cam.top = shadowReach
    cam.updateProjectionMatrix()
    gl.shadowMap.needsUpdate = true
    invalidate()
  }, [shadowReach, gl, invalidate])

  useFrame(({ clock }) => {
    if (motion === 'still' || frame.current++ % 4 === 0) gl.shadowMap.needsUpdate = true
    if (clock.elapsedTime - last.current < 2) return
    last.current = clock.elapsedTime
    apply()
  })

  return (
    <>
      <fog attach="fog" args={['#DDE7E4', cameraDistance + 40, cameraDistance + 230]} />
      <hemisphereLight ref={hemi} args={['#E2EDF0', '#80705A', 1.1]} />
      <directionalLight
        ref={sun}
        castShadow
        intensity={1.8}
        position={[20, 30, 10]}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-shadowReach}
        shadow-camera-right={shadowReach}
        shadow-camera-top={shadowReach}
        shadow-camera-bottom={-shadowReach}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-bias={-0.0004}
        shadow-normalBias={0.035}
      />
    </>
  )
}
