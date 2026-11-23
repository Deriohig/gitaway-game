import { defineConfig } from 'vitest/config'

// The balance simulator (`npm run balance`, spec §2): local only. Its files end
// in `.sim.ts`, so neither `npm test` nor CI ever runs them.
export default defineConfig({
  define: { __DEV_TOOLS__: 'false' },
  test: {
    include: ['src/game/balance/**/*.sim.ts'],
    environment: 'node',
    testTimeout: 120_000,
  },
})
