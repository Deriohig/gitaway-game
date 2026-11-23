import { skyAt, type SkyState } from './skyPalette'

/** The current sky, updated by DayCycle and read by animated objects each frame. */
export const sky: { current: SkyState } = { current: skyAt(13) }
