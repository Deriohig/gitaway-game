// The art session's water-core.mjs is plain JavaScript with no types. Only
// core.test.ts imports it, to hold the generated copy (core.gen.ts) and the
// hand ports (core.ts) to it, so this types just the pieces the test calls.
// Nothing the game ships imports from art/.
declare module '*/water-core.mjs' {
  interface ArtWaterCore {
    [name: string]: unknown
    waterPhases(t: number, speeds?: { normalSpeed?: number; riverFlowSpeed?: number; fallStreakSpeed?: number }): unknown
    patchWaterLambert(
      vertexShader: string,
      fragmentShader: string,
      opts?: { kind?: string; tier?: string; flow?: boolean; join?: boolean; brink?: boolean; vhead?: boolean; ripple?: boolean; debug?: number },
    ): { vertexShader: string; fragmentShader: string; applied: boolean; misses: string[] }
    bodyColours(presetWater: unknown, json: unknown, palette: string): Record<string, string>
    decode: { depth(byte: number): number; sd(byte: number): number; flow(byte: number): number }
  }
  const core: ArtWaterCore
  export default core
}
