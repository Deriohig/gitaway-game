import { expect, it } from 'vitest'

// Windows and macOS file systems ignore case, so names differing only by case collide there but not on Linux.
it('has no source files whose paths differ only by case', () => {
  const seen = new Map<string, string>()
  const clashes: string[] = []
  for (const path of Object.keys(import.meta.glob('/src/**/*'))) {
    const key = path.toLowerCase().replace(/\.(tsx?|jsx?)$/, '')
    const other = seen.get(key)
    if (other) clashes.push(`${other} ↔ ${path}`)
    else seen.set(key, path)
  }
  expect(clashes).toEqual([])
})
