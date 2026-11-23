import * as THREE from 'three'
import type { MotionLevel } from '../motion'
import { rng } from '../random'
import type { RigClip, RigEntry } from './data'

// One drawn copy of an animal rig: its own mixer playing the clips authored in
// Blender, and a live layer on top of them each frame (a look, blinks, an ear
// twitch, the tail by mood), as art/blender/rigs/GAME-NOTE.md describes. The
// animal's behaviour (rigs/brain.ts) says what to play; this plays it.

/** How long a new clip takes to blend in, seconds. */
const FADE = 0.25
/** Sleep starts on Lie's last body pose with its head already down: a quick fade would show the head drop (ruling R16). */
const LIE_TO_SLEEP = 0.4
/** What a hold goes on to once it has played. Sleep follows Lie, never the default pose. */
const FOLLOWS: Record<string, string> = { Lie: 'Sleep' }
/** Clips that turn or lower the head themselves: the live look fades out while they play. */
const LOOK_FADES = new Set(['Graze', 'Scratch', 'Preen', 'Dabble', 'Groom', 'Peek', 'Sniff', 'Peck'])
/** How long the look takes to come and go, seconds. */
const LOOK_EASE = 0.3
const BLINK = 0.15
const BLINK_EVERY = [2, 6] as const
const TWITCH = 0.25
const TWITCH_EVERY = [3, 9] as const
const DEG = Math.PI / 180
const TWITCH_TURN = 15 * DEG
/** An ear tears past this far from rest, the clip's turn and a twitch together. */
const EAR_LIMIT = 25 * DEG

export type Mood = 'calm' | 'content' | 'happy'
/** How far the tail's wag reaches by mood, against the clips' own. The clips hold whole wag cycles, so it stays seamless. */
const WAG: Record<Mood, number> = { calm: 0.6, content: 1, happy: 1.6 }

const X_AXIS = new THREE.Vector3(1, 0, 0)
const UP = new THREE.Vector3(0, 1, 0)
/** The animal's left (up × forward): what a nod turns about. */
const LEFT = { '+Z': new THREE.Vector3(1, 0, 0), '+X': new THREE.Vector3(0, 0, -1) }

interface Pose {
  p: THREE.Vector3
  q: THREE.Quaternion
  s: THREE.Vector3
}
const poseOf = (o: THREE.Object3D): Pose => ({ p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() })
function setPose(o: THREE.Object3D, pose: Pose) {
  o.position.copy(pose.p)
  o.quaternion.copy(pose.q)
  o.scale.copy(pose.s)
}
function keepPose(pose: Pose, o: THREE.Object3D) {
  pose.p.copy(o.position)
  pose.q.copy(o.quaternion)
  pose.s.copy(o.scale)
}

/** A look clamped to the rig's measured ellipse, (yaw/Y)² + (pitch/P)² ≤ 1, scaled back along its own direction (ruling R31). Degrees. */
export function clampLook(yaw: number, pitch: number, look: { yaw: number; pitch: number }): { yaw: number; pitch: number } {
  if (!look.yaw || !look.pitch) return { yaw: 0, pitch: 0 }
  const v = (yaw / look.yaw) ** 2 + (pitch / look.pitch) ** 2
  if (v <= 1) return { yaw, pitch }
  const k = 1 / Math.sqrt(v)
  return { yaw: yaw * k, pitch: pitch * k }
}

/** The yaw (towards its left) and pitch (nose down) that point the animal's forward along `dir`, in the rig's own frame. Degrees. */
export function lookAngles(dir: THREE.Vector3, facing: '+Z' | '+X'): { yaw: number; pitch: number } {
  const ahead = facing === '+X' ? dir.x : dir.z
  const left = facing === '+X' ? -dir.z : dir.x
  return { yaw: Math.atan2(left, ahead) / DEG, pitch: Math.atan2(-dir.y, Math.hypot(ahead, left)) / DEG }
}

/** The Walk's time scale that keeps the feet planted at `speed` (world units a second) for a rig drawn `scale` times its size. */
export function walkTimeScale(speed: number, scale: number, clip: RigClip): number {
  return clip.stride && speed > 0 ? speed / scale / (clip.stride / clip.duration) : 1
}

const _d = new THREE.Quaternion()
const _q = new THREE.Quaternion()
const _axis = new THREE.Vector3()

/** Turns `q` so its turn from `rest` is `k` times as far, about the same axis. */
function scaleTurn(q: THREE.Quaternion, rest: THREE.Quaternion, k: number) {
  _d.copy(rest).invert().multiply(q)
  if (_d.w < 0) _d.set(-_d.x, -_d.y, -_d.z, -_d.w)
  const s = Math.sqrt(Math.max(0, 1 - _d.w * _d.w))
  if (s < 1e-6) return
  _axis.set(_d.x / s, _d.y / s, _d.z / s)
  q.copy(rest).multiply(_d.setFromAxisAngle(_axis, 2 * Math.acos(Math.min(1, _d.w)) * k))
}

/** Keeps `q` within `max` radians of `rest`. */
function clampTurn(q: THREE.Quaternion, rest: THREE.Quaternion, max: number) {
  const turn = rest.angleTo(q)
  if (turn > max) q.copy(_q.copy(rest).slerp(q, max / turn))
}

const _rootInv = new THREE.Quaternion()
const _wp = new THREE.Quaternion()
const _share = new THREE.Quaternion()
const _nod = new THREE.Quaternion()
const _dir = new THREE.Vector3()
const _at = new THREE.Vector3()

export class RigController {
  readonly mixer: THREE.AnimationMixer
  /** The skinned mesh, for the off-screen check. */
  readonly mesh: THREE.SkinnedMesh | null
  private readonly actions = new Map<string, THREE.AnimationAction>()
  private readonly names = new Map<THREE.AnimationAction, string>()
  private readonly bones: THREE.Object3D[]
  private readonly rest: Pose[]
  /**
   * Each bone as the clips left it, before the live layer. three's mixer only
   * writes a value that changed since the frame before, so a live bone is put
   * back here first each frame: one still showing last frame's look or blink
   * would otherwise keep it, and build on it.
   */
  private readonly clipPose: Pose[]
  private readonly live: number[]
  private readonly ears: number[]
  private readonly tails: number[]
  private readonly lookBones: THREE.Object3D[]
  private readonly lids: THREE.Object3D[]
  private readonly rand: () => number
  private baseName = ''
  private onceName: string | null = null
  /** The clip blended in now: the base, or a once-clip over it. */
  private playing = ''
  private speed = 0
  private scale = 1
  private target: THREE.Vector3 | null = null
  private lookWeight = 0
  private mood: Mood = 'content'
  private blinkIn: number
  private blinkAt = -1
  private twitchIn: number
  private twitchAt = -1
  private twitchEar = 0
  /** The bones are held at rest: still mode, or nothing has played yet. */
  private atRest = true

  constructor(
    readonly root: THREE.Object3D,
    clips: THREE.AnimationClip[],
    readonly entry: RigEntry,
    seed = 0,
  ) {
    this.rand = rng(seed * 7919 + 17)
    this.mixer = new THREE.AnimationMixer(root)
    let mesh: THREE.SkinnedMesh | null = null
    root.traverse((o) => {
      if (!mesh && (o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh
    })
    this.mesh = mesh
    this.bones = entry.bones.map((n) => root.getObjectByName(n)).filter((o): o is THREE.Object3D => !!o)
    this.rest = this.bones.map(poseOf)
    this.clipPose = this.bones.map(poseOf)
    const index = (name: string) => this.bones.findIndex((b) => b.name === name)
    this.live = entry.live.map(index).filter((i) => i >= 0)
    this.ears = this.live.filter((i) => this.bones[i].name.startsWith('ear_'))
    this.tails = this.live.filter((i) => this.bones[i].name.startsWith('tail_'))
    const depth = (o: THREE.Object3D) => {
      let d = 0
      for (let p = o.parent; p; p = p.parent) d++
      return d
    }
    this.lookBones = entry.look.bones
      .map((n) => this.bones[index(n)])
      .filter((o): o is THREE.Object3D => !!o?.parent)
      .sort((a, b) => depth(a) - depth(b))
    this.lids = entry.lids.map((n) => this.bones[index(n)]).filter((o): o is THREE.Object3D => !!o)

    for (const clip of clips) {
      const def = entry.clips[clip.name]
      if (!def) continue
      const action = this.mixer.clipAction(clip)
      if (def.type === 'loop') action.setLoop(THREE.LoopRepeat, Infinity)
      else {
        // A hold keeps its last frame; a once-clip ends at the default pose and is faded out from there.
        action.setLoop(THREE.LoopOnce, 1)
        action.clampWhenFinished = true
      }
      this.actions.set(clip.name, action)
      this.names.set(action, clip.name)
    }
    this.mixer.addEventListener('finished', (e) => this.finished(this.names.get(e.action)))

    this.baseName = this.actions.has('Idle') ? 'Idle' : ([...this.actions.keys()].find((n) => entry.clips[n].type === 'loop') ?? '')
    if (this.baseName) {
      this.fadeTo(this.baseName)
      // Each copy starts its loop somewhere of its own, so two hens never move as one.
      this.actions.get(this.baseName)!.time = this.rand() * entry.clips[this.baseName].duration
    }
    this.blinkIn = this.between(BLINK_EVERY)
    this.twitchIn = this.between(TWITCH_EVERY)
  }

  /** The loop or hold the animal rests in. */
  get base(): string {
    return this.baseName
  }

  /** A once-clip is playing over the base. */
  get busy(): boolean {
    return this.onceName !== null
  }

  has(clip: string): boolean {
    return this.actions.has(clip)
  }

  isLoop(clip: string): boolean {
    return this.entry.clips[clip]?.type === 'loop'
  }

  /** Rests in this loop or hold from now on, blended in at once unless a once-clip is playing (then once it ends). */
  setBase(clip: string): void {
    if (clip === this.baseName || !this.actions.has(clip) || this.entry.clips[clip].type === 'once') return
    this.baseName = clip
    if (!this.onceName) this.fadeTo(clip)
  }

  /** Plays a once-clip over the base, which comes back after it. Only one at a time; `interrupt` cuts short another one. */
  playOnce(clip: string, interrupt = false): boolean {
    if (!this.actions.has(clip) || this.entry.clips[clip].type !== 'once') return false
    if (this.onceName && (!interrupt || this.onceName === clip)) return false
    this.onceName = clip
    this.fadeTo(clip)
    return true
  }

  /** How fast the object is being moved over the ground, in world units a second, and how much larger than the rig it is drawn. */
  setWalkSpeed(speed: number, scale = 1): void {
    this.speed = speed
    this.scale = scale
  }

  /** A point in the world to look at (kept as given, so a camera's position is followed), or null to look ahead again. */
  lookAt(target: THREE.Vector3 | null): void {
    this.target = target
  }

  setMood(mood: Mood): void {
    this.mood = mood
  }

  /**
   * One frame, `dt` seconds. Still mode holds the default pose (the joints'
   * rest) and plays nothing; calm plays at half speed. An animal off screen
   * is left as it is.
   */
  update(dt: number, motion: MotionLevel, inView = true): void {
    if (motion === 'still') {
      if (!this.atRest) {
        this.bones.forEach((b, i) => this.live.includes(i) || keepPose(this.clipPose[i], b))
        this.toRest()
      }
      return
    }
    if (!inView) return
    if (this.atRest) {
      this.bones.forEach((b, i) => setPose(b, this.clipPose[i]))
      this.atRest = false
    } else for (const i of this.live) setPose(this.bones[i], this.clipPose[i])
    this.mixer.timeScale = motion === 'calm' ? 0.5 : 1
    this.paceWalk()
    this.mixer.update(Math.min(dt, 0.1))
    for (const i of this.live) keepPose(this.clipPose[i], this.bones[i])
    this.liveLayer(Math.min(dt, 0.1) * this.mixer.timeScale)
  }

  /** Puts every joint at its rest, the default pose. */
  toRest(): void {
    this.bones.forEach((b, i) => setPose(b, this.rest[i]))
    this.atRest = true
  }

  dispose(): void {
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.root)
  }

  private between([lo, hi]: readonly [number, number]): number {
    return lo + this.rand() * (hi - lo)
  }

  private fadeTo(clip: string) {
    const next = this.actions.get(clip)
    if (!next) return
    const prev = this.actions.get(this.playing)
    next.reset().play()
    if (prev && prev !== next) prev.crossFadeTo(next, this.playing === 'Lie' && clip === 'Sleep' ? LIE_TO_SLEEP : FADE, false)
    this.playing = clip
  }

  private finished(clip: string | undefined) {
    if (!clip) return
    if (clip === this.onceName) {
      this.onceName = null
      this.fadeTo(this.baseName)
    } else if (clip === this.playing && clip === this.baseName) {
      const next = FOLLOWS[clip]
      if (next && this.actions.has(next)) {
        this.baseName = next
        this.fadeTo(next)
      }
    }
  }

  /** The Walk keeps its feet planted at the object's ground speed, whatever the mixer's own pace. */
  private paceWalk() {
    const def = this.entry.clips[this.baseName]
    const walk = this.actions.get(this.baseName)
    if (def?.stride && walk) walk.timeScale = walkTimeScale(this.speed, this.scale, def) / this.mixer.timeScale
  }

  private liveLayer(dt: number) {
    const wag = WAG[this.mood]
    if (wag !== 1) for (const i of this.tails) scaleTurn(this.bones[i].quaternion, this.rest[i].q, wag)
    this.twitch(dt)
    this.look(dt)
    this.blink(dt)
  }

  /** Now and then a quick flick of one ear, kept within its limit. */
  private twitch(dt: number) {
    if (!this.ears.length) return
    if (this.twitchAt < 0) {
      this.twitchIn -= dt
      if (this.twitchIn > 0 || this.playing === 'EarTwitch') return
      this.twitchAt = 0
      this.twitchEar = this.ears[Math.floor(this.rand() * this.ears.length)]
    }
    this.twitchAt += dt
    if (this.twitchAt >= TWITCH) {
      this.twitchAt = -1
      this.twitchIn = this.between(TWITCH_EVERY)
      return
    }
    const i = this.twitchEar
    const ear = this.bones[i]
    ear.quaternion.multiply(_q.setFromAxisAngle(X_AXIS, TWITCH_TURN * Math.sin((Math.PI * this.twitchAt) / TWITCH)))
    clampTurn(ear.quaternion, this.rest[i].q, EAR_LIMIT)
  }

  /**
   * Turns the head towards the target, within the rig's ellipse, split evenly
   * over the look's bones, parent first, each in the rig's own axes about its
   * joint: as lookPose in art/scripts/lib/rig-inspect.mjs does it.
   */
  private look(dt: number) {
    const n = this.lookBones.length
    if (!n) return
    const goal = this.target && !LOOK_FADES.has(this.playing) ? 1 : 0
    const step = dt / LOOK_EASE
    this.lookWeight = goal > this.lookWeight ? Math.min(goal, this.lookWeight + step) : Math.max(goal, this.lookWeight - step)
    if (this.lookWeight <= 0 || !this.target) return

    const facing = this.entry.facing
    _rootInv.copy(this.root.getWorldQuaternion(_wp)).invert()
    _dir.copy(this.target).sub(this.lookBones[n - 1].getWorldPosition(_at)).applyQuaternion(_rootInv)
    const aim = lookAngles(_dir, facing)
    const { yaw, pitch } = clampLook(aim.yaw, aim.pitch, this.entry.look)
    _share
      .setFromAxisAngle(UP, ((yaw * this.lookWeight) / n) * DEG)
      .multiply(_nod.setFromAxisAngle(LEFT[facing], ((pitch * this.lookWeight) / n) * DEG))
    for (const bone of this.lookBones) {
      // The parent's turn in the rig's own space: the share is made about the joint in those axes.
      bone.parent!.getWorldQuaternion(_wp).premultiply(_rootInv)
      bone.quaternion.premultiply(_q.copy(_wp).invert().multiply(_share).multiply(_wp))
    }
  }

  /** A blink every few seconds, shutting the lids and opening them over 0.15 s; never opening an eye a clip has shut. */
  private blink(dt: number) {
    if (!this.lids.length) return
    if (this.blinkAt < 0) {
      this.blinkIn -= dt
      if (this.blinkIn > 0) return
      this.blinkAt = 0
    }
    this.blinkAt += dt
    if (this.blinkAt >= BLINK) {
      this.blinkAt = -1
      this.blinkIn = this.between(BLINK_EVERY)
      return
    }
    const shut = Math.sin((Math.PI * this.blinkAt) / BLINK)
    for (const lid of this.lids) lid.scale.setScalar(Math.max(lid.scale.x, shut))
  }
}
