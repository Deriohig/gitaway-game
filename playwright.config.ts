import { defineConfig, devices } from '@playwright/test'

// The suite runs against the production build (with its strict CSP), served
// locally by `vite preview`. Every test gets a fresh browser context, so each
// starts from an empty farm in its own IndexedDB. Set E2E_PORT to run several
// suites side by side (one per worktree) without their servers colliding.

const PORT = Number(process.env.E2E_PORT ?? 4173)

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // Still mode keeps the island static, which is lighter on the machine.
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // `vite build`, not `npm run build`: the type check isn't needed to test the
    // build, and npm run check:push runs it alongside the suite.
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
