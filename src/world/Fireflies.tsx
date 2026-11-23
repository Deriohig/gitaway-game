import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { MAIN } from './layout'
import { rng } from './random'
import { sky } from './skyRef'

// Soft glowing motes that come out in the evening. All movement happens in
// the vertex shader, so they cost almost nothing.

export function Fireflies({ count = 26 }: { count?: number }) {
  const { geometry, material } = useMemo(() => {
    const r = rng(17)
    const pos: number[] = []
    const phase: number[] = []
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2
      const d = 1.5 + Math.sqrt(r()) * 6
      const x = Math.cos(a) * d
      const z = Math.sin(a) * d
      pos.push(x, MAIN.height(x, z) + 0.4 + r() * 1.1, z)
      phase.push(r() * 100)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geometry.setAttribute('phase', new THREE.Float32BufferAttribute(phase, 1))
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uScale: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float phase;
        uniform float uTime; uniform float uScale;
        varying float vTwinkle;
        void main() {
          vec3 p = position;
          float t = uTime * 0.35 + phase;
          p += vec3(sin(t * 0.9) * 0.45, sin(t * 1.3) * 0.22, cos(t * 0.7) * 0.45);
          vTwinkle = 0.55 + 0.45 * sin(uTime * 2.1 + phase * 3.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = 210.0 * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying float vTwinkle;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          a = a * a * uOpacity * vTwinkle;
          gl_FragColor = vec4(vec3(1.0, 0.86, 0.52) * a, a);
        }`,
    })
    return { geometry, material }
  }, [count])

  useFrame(({ clock, gl }) => {
    material.uniforms.uTime.value = clock.elapsedTime
    material.uniforms.uOpacity.value = sky.current.fireflies
    material.uniforms.uScale.value = gl.getPixelRatio()
  })
  return <points geometry={geometry} material={material} frustumCulled={false} />
}
