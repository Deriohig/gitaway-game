// Music during work sessions: three lo-fi tracks by Freaq Studios, played in
// turn while a session runs. Nothing downloads until the first session starts.

export const SESSION_TRACKS = [
  { file: 'music/lofi-study-session.mp3', title: 'Lofi Study Session' },
  { file: 'music/lofi-studying.mp3', title: 'Lofi Studying' },
  { file: 'music/lofi-harp-and-gamelan.mp3', title: 'Lofi Harp & Gamelan' },
] as const

export const MUSIC_VOLUME = 0.6
const FADE_IN_MS = 3000
const FADE_OUT_MS = 1500
const FADE_STEP_MS = 50

export function nextTrack(index: number, count: number = SESSION_TRACKS.length): number {
  return (index + 1) % count
}

let audio: HTMLAudioElement | null = null
let playing = false
// Where the next session starts. Kept for as long as the page is open, never saved.
let track = 0
let fade: ReturnType<typeof setInterval> | undefined
// A fade-in waiting for the sound to start.
let ramp: (() => void) | null = null
let retry: (() => void) | null = null

const trackUrl = (index: number) => `${import.meta.env.BASE_URL}${SESSION_TRACKS[index].file}`

function player(): HTMLAudioElement {
  if (audio) return audio
  const el = document.createElement('audio')
  el.hidden = true
  el.dataset.testid = 'session-music'
  el.preload = 'none'
  el.addEventListener('ended', () => {
    if (!playing) return
    track = nextTrack(track)
    el.src = trackUrl(track)
    play(el)
  })
  document.body.append(el)
  audio = el
  return el
}

/** Cancels any fade under way, and a fade-in still waiting for the sound. */
function stopFading() {
  clearInterval(fade)
  fade = undefined
  if (ramp) audio?.removeEventListener('playing', ramp)
  ramp = null
}

// Steps with setInterval, which keeps going in a background tab, where
// requestAnimationFrame stops. The volume follows the time that has passed,
// so a throttled timer makes the steps coarser, not the fade longer.
function fadeTo(el: HTMLAudioElement, volume: number, ms: number, then?: () => void) {
  stopFading()
  const from = el.volume
  const start = performance.now()
  fade = setInterval(() => {
    const done = Math.min(1, (performance.now() - start) / ms)
    el.volume = from + (volume - from) * done
    if (done < 1) return
    clearInterval(fade)
    fade = undefined
    then?.()
  }, FADE_STEP_MS)
}

function fadeIn(el: HTMLAudioElement) {
  stopFading()
  el.volume = 0
  // With nothing preloaded, a slow connection can take longer than the fade
  // to deliver the first notes, so the fade waits for the sound to start.
  ramp = () => {
    ramp = null
    fadeTo(el, MUSIC_VOLUME, FADE_IN_MS)
  }
  el.addEventListener('playing', ramp, { once: true })
  play(el)
}

function play(el: HTMLAudioElement) {
  el.play().catch(() => {
    // After a reload the browser may hold the music back until the player
    // touches the page, so try again on their first tap, click or key press.
    // A tap only counts once the finger lifts, hence pointerup.
    if (!playing || !el.paused || retry) return
    retry = () => {
      dropRetry()
      if (playing) fadeIn(el)
    }
    window.addEventListener('pointerup', retry, { capture: true })
    window.addEventListener('keydown', retry, { capture: true })
  })
}

function dropRetry() {
  if (!retry) return
  window.removeEventListener('pointerup', retry, { capture: true })
  window.removeEventListener('keydown', retry, { capture: true })
  retry = null
}

export function startMusic(): void {
  if (playing) return
  playing = true
  const el = player()
  el.src = trackUrl(track)
  fadeIn(el)
}

export function stopMusic(): void {
  if (!playing || !audio) return
  playing = false
  dropRetry()
  const el = audio
  track = nextTrack(track)
  fadeTo(el, 0, FADE_OUT_MS, () => el.pause())
}
